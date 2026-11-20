// Server-only Supabase client (service role). Used by the worker, seed and pipeline scripts. Never import in client code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Throws with the table and message if a Supabase call failed, so pipeline errors are specific. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<T>; // inserts without .select() legitimately return null data; callers ignore it
}
