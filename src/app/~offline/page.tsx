import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";

export default async function OfflinePage() {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <section className="w-full max-w-sm rounded-[1.3rem] bg-surface px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[0.9rem] bg-surface-soft text-lg text-foreground">
          ○
        </div>
        <h1 className="text-xl font-semibold text-foreground">{t.offline}</h1>
        <p className="mt-2.5 text-sm leading-6 text-text-muted">
          {t.offlineHint}
        </p>
      </section>
    </main>
  );
}
