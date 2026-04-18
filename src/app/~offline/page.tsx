import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";

export default async function OfflinePage() {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <section className="device-shadow w-full max-w-sm rounded-[1.6rem] bg-surface px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[1rem] bg-surface-soft text-xl text-accent">
          ○
        </div>
        <h1 className="text-xl font-semibold text-foreground">{t.offline}</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">
          {t.offlineHint}
        </p>
      </section>
    </main>
  );
}
