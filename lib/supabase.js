import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { realtime: { params: { eventsPerSecond: 10 } } }
);

export const FLOW = ['REQUESTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE'];

export function fmt(ts) {
  if (!ts) return '\u2014';
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}
