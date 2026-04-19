export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      (process.env.SUPABASE_DB_SCHEMA ||
        process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA),
  );
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbSchema =
    process.env.SUPABASE_DB_SCHEMA ??
    process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA;

  if (!url || !anonKey || !dbSchema) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_DB_SCHEMA or NEXT_PUBLIC_SUPABASE_DB_SCHEMA.",
    );
  }

  return { url, anonKey, dbSchema };
}
