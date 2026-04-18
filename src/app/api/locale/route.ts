import { NextResponse } from "next/server";

import { LOCALE_COOKIE, normalizeLocale } from "@/lib/locale";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    locale?: string;
  };
  const locale = normalizeLocale(payload.locale);

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
