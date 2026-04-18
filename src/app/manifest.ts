import type { MetadataRoute } from "next";
import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);

  return {
    name: "TaskOrbit",
    short_name: "TaskOrbit",
    description: t.manifestDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#31cc74",
    lang: t.langCode,
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
