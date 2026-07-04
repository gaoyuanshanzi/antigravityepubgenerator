import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evvia EPUB Generator & Translator",
  description: "AI-powered Korean to English document translator and EPUB book compiler",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
