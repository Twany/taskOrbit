import Link from "next/link";
import { ArrowRight, Home } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";
import { requestEmailCode, signInWithGoogle, verifyEmailCode } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string; email?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const t = getDictionary(locale);
  const status = params.status ?? "idle";
  const message = params.message;
  const email = params.email ?? "";
  const showCodeForm = Boolean(email);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm rounded-[1.3rem] bg-surface px-6 py-8">
        <Link className="pressable inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/">
          <Home className="h-4 w-4" />
          {t.back}
        </Link>

        <div className="mt-6">
          <h1 className="text-2xl font-semibold tracking-[-0.05em] text-foreground">
            {t.loginTitle}
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">
            {t.loginIntro}
          </p>
        </div>

        {message ? (
          <div
            className={`mt-5 rounded-[0.9rem] px-4 py-3 text-sm ${
              status === "sent"
                ? "bg-[#edf8f1] text-accent-strong"
                : "bg-[#f8eceb] text-[#c55b59]"
            }`}
          >
            {message}
          </div>
        ) : null}

        <form action={signInWithGoogle} className="mt-6">
          <FormSubmitButton
            className="pressable flex w-full items-center justify-center gap-2 rounded-[0.9rem] bg-surface-soft px-4 py-4 text-base font-semibold text-foreground"
            pendingLabel={t.opening}
          >
            {t.google}
            <ArrowRight className="h-4 w-4" />
          </FormSubmitButton>
        </form>

        <div className="mt-5 flex items-center gap-3 text-[12px] text-text-soft">
          <div className="h-px flex-1 bg-surface-soft" />
          <span>{t.or}</span>
          <div className="h-px flex-1 bg-surface-soft" />
        </div>

        <form action={requestEmailCode} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">{t.email}</span>
            <input
              className="w-full rounded-[0.95rem] bg-surface-soft px-4 py-4 text-base text-foreground outline-none"
              defaultValue={email}
              name="email"
              placeholder={t.emailPlaceholder}
              type="email"
            />
          </label>
          <FormSubmitButton
            className="pressable w-full rounded-[0.9rem] bg-accent px-4 py-4 text-base font-semibold text-white"
            pendingLabel={t.sending}
          >
            {t.send}
          </FormSubmitButton>
        </form>

        {showCodeForm ? (
          <form action={verifyEmailCode} className="mt-4 space-y-4">
            <input name="email" type="hidden" value={email} />
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">{t.code}</span>
              <input
                className="w-full rounded-[0.95rem] bg-surface-soft px-4 py-4 text-base text-foreground outline-none"
                inputMode="numeric"
                name="token"
                placeholder={t.codePlaceholder}
                type="text"
              />
            </label>
            <FormSubmitButton
              className="pressable w-full rounded-[0.9rem] bg-surface-soft px-4 py-4 text-base font-semibold text-foreground"
              pendingLabel={t.verifying}
            >
              {t.verify}
            </FormSubmitButton>
          </form>
        ) : null}
      </section>
    </main>
  );
}
