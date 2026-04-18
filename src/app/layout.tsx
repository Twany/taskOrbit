import type { Metadata, Viewport } from "next";
import { DM_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { getDictionary } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale.server";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

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
      className={`${plusJakartaSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
