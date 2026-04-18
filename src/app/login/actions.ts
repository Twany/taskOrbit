"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDictionary, LOCALE_COOKIE, normalizeLocale } from "@/lib/locale";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const headerStore = await headers();
  const locale = normalizeLocale(headerStore.get("cookie")?.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`))?.[1]);
  const t = getDictionary(locale);

  if (!email) {
    redirect(`/login?status=error&message=${encodeURIComponent(t.loginMissingEmail)}`);
  }

  if (!hasSupabaseEnv()) {
    redirect(`/login?status=missing-env&message=${encodeURIComponent(t.loginMissingEnv)}`);
  }

  const origin = headerStore.get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?status=error&message=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?status=sent&message=${encodeURIComponent(t.magicLinkSent(email))}`);
}
