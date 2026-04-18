import Link from "next/link";
import { Home } from "lucide-react";

import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";
import { requestMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const t = getDictionary(locale);
  const status = params.status ?? "idle";
  const message = params.message;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="device-shadow w-full max-w-sm rounded-[1.6rem] bg-surface px-6 py-8">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-accent-strong" href="/">
          <Home className="h-4 w-4" />
          {t.back}
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold text-accent-strong">{t.sync}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
            {t.loginTitle}
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">
            {t.loginIntro}
          </p>
        </div>

        {message ? (
          <div
            className={`mt-5 rounded-[1.25rem] px-4 py-3 text-sm ${
              status === "sent"
                ? "bg-[#effdf4] text-accent-strong"
                : "bg-[#fff6f6] text-[#cc5d5b]"
            }`}
          >
            {message}
          </div>
        ) : null}

        <form action={requestMagicLink} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-foreground">{t.email}</span>
            <input
              className="w-full rounded-[1rem] bg-surface-soft px-4 py-4 text-base text-foreground outline-none"
              name="email"
              placeholder={t.emailPlaceholder}
              type="email"
            />
          </label>
          <button className="w-full rounded-[1rem] bg-accent px-4 py-4 text-base font-semibold text-white" type="submit">
            {t.send}
          </button>
        </form>

        <div className="mt-6 rounded-[1rem] bg-surface-soft px-4 py-4 text-sm text-text-muted">
          {t.keysHint} <code className="font-mono text-foreground">.env.local</code>. {t.schemaHint}{" "}
          <code className="font-mono text-foreground">supabase/schema.sql</code>.
        </div>
      </section>
    </main>
  );
}
