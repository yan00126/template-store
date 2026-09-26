// Pipe directly into kubectl; never write or print this output to a shared log.
if (!process.env.SUPABASE_KEY) throw new Error('SUPABASE_KEY is required');
console.log(JSON.stringify({ apiVersion: 'v1', kind: 'Secret',
  metadata: { name: 'store-monitor', namespace: 'store-monitor' },
  type: 'Opaque', stringData: { SUPABASE_KEY: process.env.SUPABASE_KEY } }));
