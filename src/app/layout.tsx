import type { Metadata, Viewport } from "next";
import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = getDictionary(locale);

  return {
  metadataBase: new URL("https://taskorbit.local"),
  title: {
    default: "TaskOrbit",
    template: "%s | TaskOrbit",
  },
  description: t.brandDescription,
  applicationName: "TaskOrbit",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TaskOrbit",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#31cc74",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
