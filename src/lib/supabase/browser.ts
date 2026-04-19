import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

export function createSupabaseBrowserClient() {
  const { url, anonKey, dbSchema } = getSupabaseEnv();

  return createBrowserClient(url, anonKey, {
    db: {
      schema: dbSchema,
    },
  });
}
