// Pipe directly into kubectl. Never print this output into shared logs.
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is required');
console.log(JSON.stringify({ apiVersion: 'v1', kind: 'Secret',
  metadata: { name: 'supabase-resume', namespace: 'store-monitor' },
  type: 'Opaque', stringData: { SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN } }));
