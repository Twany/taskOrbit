import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDictionary, LOCALE_COOKIE, normalizeLocale } from "@/lib/locale";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const { url: supabaseUrl, anonKey, dbSchema } = getSupabaseEnv();
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const t = getDictionary(locale);
  const successResponse = NextResponse.redirect(new URL(next, request.url));

  if (code) {
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
            successResponse.cookies.set(name, value, options);
          });
        },
      },
    });
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return NextResponse.redirect(
        new URL(`/login?status=error&message=${encodeURIComponent(t.googleStartFailed)}`, request.url),
      );
    }

    const { error: setupError } = await supabase.rpc("ensure_current_user_setup");

    if (setupError) {
      return NextResponse.redirect(
        new URL(
          `/login?status=error&message=${encodeURIComponent(t.loginSetupFailed)}`,
          request.url,
        ),
      );
    }
  }

  return successResponse;
}
