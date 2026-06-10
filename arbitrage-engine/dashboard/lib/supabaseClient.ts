"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client (ANON key). Realtime + read-only access to opportunities.
// Returns null when env is missing (e.g. demo mode) so the UI can degrade gracefully.
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!_client) _client = createClient(url, key);
  return _client;
}

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO === "1";
