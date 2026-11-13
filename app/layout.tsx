import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jurnal Trading - Platform Analisis & Evaluasi Trade",
  description: "Catat, analisis, dan tingkatkan performa trading Anda dengan jurnal modern.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
