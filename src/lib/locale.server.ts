import "server-only";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, normalizeLocale } from "./locale";

export async function getRequestLocale() {
	const store = await cookies();
	return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}
