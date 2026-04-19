import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { url: supabaseUrl, anonKey, dbSchema } = getSupabaseEnv();
  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL("/", request.url));
  const supabase = createServerClient(supabaseUrl, anonKey, {
    db: {
      schema: dbSchema,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.signOut();

  return response;
}
