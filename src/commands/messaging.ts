import type { Command } from 'commander';
import { restGet, restPost } from '../api.js';
import { readConfig } from '../config.js';
import { output } from '../output.js';

function activeOrg(override?: string): string {
  const orgId = override || readConfig().active_org_id;
  if (!orgId) throw new Error('No active organization. Run `aca org switch <id>` or pass --organization.');
  return orgId;
}

/** Step conversion in %, or null below the sample floor (1/1 = 100% means nothing). */
function stepRate(part: number, base: number, floor: number): number | null {
  return base >= floor && base > 0 ? Math.round((part / base) * 1000) / 10 : null;
}

interface FunnelRow {
  campaign_id: string | null;
  channel: string;
  sent: number;
  delivered: number;
  failed: number;
  replied: number;
  positive: number;
  booked: number;
  out_of_office: number;
  auto_reply: number;
  opted_out: number;
}

// Same flow as the app's "Start a DBR campaign" (src/lib/dbr-campaign-template.ts in the app repo)
const DBR_FIRST_SMS = "Hi {{first_name}}, you asked us about this a while back. Is it still something you're looking into?";
const DBR_LAST_SMS = 'Hi {{first_name}}, last message from me. Should I close your file, or is there a better time to talk?';

function buildDbrSequence(opts: {
  templateId?: string;
  templateName?: string;
  firstSms: string;
  lastSms: string;
  daysAfterWhatsApp: number;
  daysBetweenSms: number;
}) {
  const steps: { id: string; type: string; data: Record<string, unknown> }[] = [{ id: 'start', type: 'start', data: {} }];
  if (opts.templateId) {
    steps.push({
      id: 'dbr-whatsapp',
      type: 'whatsappTemplate',
      data: { templateId: opts.templateId, templateName: opts.templateName, continueOnFailure: true },
    });
    steps.push({ id: 'dbr-wait-1', type: 'delay', data: { days: opts.daysAfterWhatsApp, hours: 0, minutes: 0 } });
  }
  steps.push({ id: 'dbr-sms-1', type: 'smsMessage', data: { message: opts.firstSms, messageVariations: [] } });
  steps.push({ id: 'dbr-wait-2', type: 'delay', data: { days: opts.daysBetweenSms, hours: 0, minutes: 0 } });
  steps.push({ id: 'dbr-sms-2', type: 'smsMessage', data: { message: opts.lastSms, messageVariations: [] } });
  steps.push({ id: 'dbr-end', type: 'end', data: {} });
  const nodes = steps.map((s, i) => ({ ...s, position: { x: 450, y: i * 160 } }));
  const edges = nodes.slice(1).map((n, i) => ({
    id: `edge-${nodes[i].id}-${n.id}-default`,
    type: 'sequenceEdge',
    source: nodes[i].id,
    target: n.id,
    sourceHandle: 'default',
  }));
  return { nodes, edges };
}

export function registerMessaging(program: Command): void {
  const messaging = program
    .command('messaging')
    .description('SMS and WhatsApp Business (Twilio): senders, templates, funnel, DBR campaigns');

  messaging
    .command('senders')
    .description('List Twilio senders (SMS numbers / sender names, WhatsApp Business senders)')
    .option('--channel <channel>', 'sms | whatsapp_business')
    .option('-o, --organization <orgId>', 'Override active organization')
    .option('--json', 'Emit JSON')
    .action(async (opts: { channel?: string; organization?: string; json?: boolean }) => {
      const params = new URLSearchParams({
        select: 'id,channel,address,address_type,country,two_way,daily_new_contact_cap,status,status_detail,wa_display_name,wa_quality_rating,wa_messaging_limit',
        organization_id: `eq.${activeOrg(opts.organization)}`,
        order: 'channel.asc,address.asc',
      });
      if (opts.channel) params.append('channel', `eq.${opts.channel}`);
      output(await restGet(`messaging_senders?${params.toString()}`), { json: opts.json });
    });

  messaging
    .command('templates')
    .description('List WhatsApp Business templates and their Meta approval status')
    .option('--status <status>', 'approved | pending | submitted | rejected | draft | paused | disabled')
    .option('-o, --organization <orgId>', 'Override active organization')
    .option('--json', 'Emit JSON')
    .action(async (opts: { status?: string; organization?: string; json?: boolean }) => {
      const params = new URLSearchParams({
        select: 'id,name,language,category,approval_status,body,variables,rejected_reason',
        organization_id: `eq.${activeOrg(opts.organization)}`,
        order: 'created_at.desc',
      });
      if (opts.status) params.append('approval_status', `eq.${opts.status}`);
      output(await restGet(`whatsapp_templates?${params.toString()}`), { json: opts.json });
    });

  messaging
    .command('funnel')
    .description('Sent → delivered → replied → positive → booked for SMS / WhatsApp campaign steps (in leads)')
    .option('--campaign <campaignId>', 'One campaign (default: all)')
    .option('--days <n>', 'Look-back window in days', '90')
    .option('-o, --organization <orgId>', 'Override active organization')
    .option('--json', 'Emit JSON')
    .action(async (opts: { campaign?: string; days: string; organization?: string; json?: boolean }) => {
      const days = Number(opts.days) || 90;
      const rows = await restPost<FunnelRow[]>('rpc/messaging_funnel', {
        p_org_id: activeOrg(opts.organization),
        p_campaign_id: opts.campaign ?? null,
        p_since: new Date(Date.now() - days * 86_400_000).toISOString(),
      });
      // Rates are step conversions; positive and booked need 5+ replies / 3+ positive
      const withRates = rows.map((r) => ({
        ...r,
        'delivered_%_of_sent': stepRate(r.delivered, r.sent, 1),
        'replied_%_of_delivered': stepRate(r.replied, r.delivered, 1),
        'positive_%_of_replies': stepRate(r.positive, r.replied, 5),
        'booked_%_of_positive': stepRate(r.booked, r.positive, 3),
      }));
      output(withRates, { json: opts.json });
    });

  messaging
    .command('dbr')
    .description('Create a draft database reactivation campaign: optional WhatsApp template, then two SMS')
    .option('--name <name>', 'Campaign name', 'Database reactivation')
    .option('--list <listId>', 'Lead list to target (can also be picked in the app)')
    .option('--template <templateId>', 'WhatsApp template (approved or in review); omit for SMS only')
    .option('--first-sms <text>', 'First text', DBR_FIRST_SMS)
    .option('--last-sms <text>', 'Last nudge', DBR_LAST_SMS)
    .option('--days-after-whatsapp <n>', 'Days between the WhatsApp template and the first SMS', '2')
    .option('--days-between-sms <n>', 'Days between the two SMS', '3')
    .option('-o, --organization <orgId>', 'Override active organization')
    .option('--json', 'Emit JSON')
    .action(
      async (opts: {
        name: string;
        list?: string;
        template?: string;
        firstSms: string;
        lastSms: string;
        daysAfterWhatsapp: string;
        daysBetweenSms: string;
        organization?: string;
        json?: boolean;
      }) => {
        const orgId = activeOrg(opts.organization);
        let templateName: string | undefined;
        if (opts.template) {
          const found = await restGet<{ name: string; approval_status: string }[]>(
            `whatsapp_templates?select=name,approval_status&id=eq.${opts.template}&organization_id=eq.${orgId}`,
          );
          if (found.length === 0) throw new Error('WhatsApp template not found (aca messaging templates)');
          if (!['approved', 'pending', 'submitted'].includes(found[0].approval_status)) {
            throw new Error(`Template "${found[0].name}" is ${found[0].approval_status}; pick an approved one`);
          }
          templateName = found[0].name;
        }
        const { nodes, edges } = buildDbrSequence({
          templateId: opts.template,
          templateName,
          firstSms: opts.firstSms,
          lastSms: opts.lastSms,
          daysAfterWhatsApp: Number(opts.daysAfterWhatsapp) || 2,
          daysBetweenSms: Number(opts.daysBetweenSms) || 3,
        });
        const created = await restPost<{ id: string; name: string; status: string }[]>(
          'linkedin_campaigns?select=id,name,status',
          {
            organization_id: orgId,
            name: opts.name,
            description: 'Database reactivation over WhatsApp Business and SMS',
            status: 'draft',
            lead_list_ids: opts.list ? [opts.list] : [],
            sequence_nodes: nodes,
            sequence_edges: edges,
            stop_on_reply: true,
            campaign_type: 'sms_whatsapp',
            primary_channel: 'sms',
          },
        );
        output(
          { ...created[0], next: 'Review it in the app (Automations), then set it active.' },
          { json: opts.json },
        );
      },
    );
}
