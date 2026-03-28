import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Weekly Dose — Your weekly briefing on Norway, the world, and tech",
  description:
    "A short podcast that gives you the most important stories in AI, tech, Norwegian and global news – in 20 minutes or less. Every Friday morning.",
  openGraph: {
    title: "The Weekly Dose",
    description: "Your weekly briefing on Norway, the world, and tech. Every Friday morning.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-[#0d0d0d] text-white antialiased">{children}</body>
    </html>
  );
}
