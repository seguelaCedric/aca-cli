export interface OutputOptions {
  json?: boolean;
}

export function output(data: unknown, { json = false }: OutputOptions = {}): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (data == null) {
    console.log('(no data)');
    return;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('(empty)');
      return;
    }
    printTable(data as Record<string, unknown>[]);
    return;
  }
  if (typeof data === 'object') {
    printKV(data as Record<string, unknown>);
    return;
  }
  console.log(String(data));
}

function printKV(obj: Record<string, unknown>): void {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    console.log('(empty)');
    return;
  }
  const w = Math.max(...keys.map((k) => k.length));
  for (const k of keys) {
    const v = obj[k];
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    console.log(`${k.padEnd(w)}  ${s}`);
  }
}

function printTable(rows: Record<string, unknown>[]): void {
  const keys: string[] = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r ?? {}).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const widths: Record<string, number> = {};
  for (const k of keys) {
    widths[k] = Math.max(
      k.length,
      ...rows.map((r) => {
        const v = r?.[k];
        const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return Math.min(s.length, 40);
      }),
    );
  }
  console.log(keys.map((k) => k.padEnd(widths[k])).join('  '));
  console.log(keys.map((k) => '-'.repeat(widths[k])).join('  '));
  for (const r of rows) {
    console.log(
      keys
        .map((k) => {
          const v = r?.[k];
          let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
          if (s.length > 40) s = s.slice(0, 37) + '...';
          return s.padEnd(widths[k]);
        })
        .join('  '),
    );
  }
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
