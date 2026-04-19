"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDictionary, LOCALE_COOKIE, normalizeLocale } from "@/lib/locale";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getAuthActionContext() {
  const headerStore = await headers();
  const locale = normalizeLocale(
    headerStore.get("cookie")?.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`))?.[1],
  );
  const t = getDictionary(locale);

  return { headerStore, locale, t };
}

export async function requestEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const { t } = await getAuthActionContext();

  if (!email) {
    redirect(`/login?status=error&message=${encodeURIComponent(t.loginMissingEmail)}`);
  }

  if (!hasSupabaseEnv()) {
    redirect(`/login?status=missing-env&message=${encodeURIComponent(t.loginMissingEnv)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
  });

  if (error) {
    redirect(`/login?status=error&message=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/login?status=sent&email=${encodeURIComponent(email)}&message=${encodeURIComponent(
      t.otpSent(email),
    )}`,
  );
}

export async function verifyEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const { t } = await getAuthActionContext();

  if (!email) {
    redirect(`/login?status=error&message=${encodeURIComponent(t.loginMissingEmail)}`);
  }

  if (!token) {
    redirect(
      `/login?status=error&email=${encodeURIComponent(email)}&message=${encodeURIComponent(
        t.loginMissingCode,
      )}`,
    );
  }

  if (!hasSupabaseEnv()) {
    redirect(`/login?status=missing-env&message=${encodeURIComponent(t.loginMissingEnv)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (verifyError) {
    redirect(
      `/login?status=error&email=${encodeURIComponent(email)}&message=${encodeURIComponent(
        verifyError.message,
      )}`,
    );
  }

  const { error: setupError } = await supabase.rpc("ensure_current_user_setup");

  if (setupError) {
    redirect(`/login?status=error&message=${encodeURIComponent(t.loginSetupFailed)}`);
  }

  redirect("/");
}

export async function signInWithGoogle() {
  const { headerStore, t } = await getAuthActionContext();

  if (!hasSupabaseEnv()) {
    redirect(`/login?status=missing-env&message=${encodeURIComponent(t.loginMissingEnv)}`);
  }

  const origin = headerStore.get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect(
      `/login?status=error&message=${encodeURIComponent(error?.message ?? t.googleStartFailed)}`,
    );
  }

  redirect(data.url);
}
