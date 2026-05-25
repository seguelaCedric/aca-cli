import type { Command } from 'commander';
import { restGet } from '../api.js';
import { readConfig, updateConfig } from '../config.js';
import { output, fail } from '../output.js';

interface OrgRow {
  organization_id: string;
  role: string;
  is_primary_owner: boolean;
  organizations: { id: string; name: string } | null;
}

export function registerOrg(program: Command): void {
  const org = program.command('org').description('Inspect and switch the active organization');

  org
    .command('ls')
    .description('List organizations you belong to')
    .option('--json', 'Emit JSON')
    .action(async (opts: { json?: boolean }) => {
      const rows = await restGet<OrgRow[]>(
        'organization_members?select=organization_id,role,is_primary_owner,organizations(id,name)&order=joined_at.asc',
      );
      const active = readConfig().active_org_id;
      const formatted = rows.map((r) => ({
        organization_id: r.organization_id,
        name: r.organizations?.name ?? '(unknown)',
        role: r.role,
        primary_owner: r.is_primary_owner,
        active: r.organization_id === active,
      }));
      output(formatted, { json: opts.json });
    });

  org
    .command('switch')
    .description('Set the active organization for subsequent commands')
    .argument('<organizationId>')
    .option('--json', 'Emit JSON')
    .action(async (organizationId: string, opts: { json?: boolean }) => {
      const rows = await restGet<OrgRow[]>(
        `organization_members?organization_id=eq.${organizationId}&select=organization_id,organizations(name)`,
      );
      if (rows.length === 0) {
        fail(`You don't belong to organization ${organizationId} (or it doesn't exist).`);
      }
      updateConfig({ active_org_id: organizationId });
      output(
        { active_org_id: organizationId, name: rows[0].organizations?.name ?? null },
        { json: opts.json },
      );
    });

  org
    .command('current')
    .description('Show the currently active organization')
    .option('--json', 'Emit JSON')
    .action(async (opts: { json?: boolean }) => {
      const active = readConfig().active_org_id;
      if (!active) {
        output(
          { active_org_id: null, hint: 'Run `aca org ls` then `aca org switch <id>`.' },
          { json: opts.json },
        );
        return;
      }
      const rows = await restGet<{ id: string; name: string }[]>(
        `organizations?id=eq.${active}&select=id,name`,
      );
      output(rows[0] ?? { active_org_id: active }, { json: opts.json });
    });
}
