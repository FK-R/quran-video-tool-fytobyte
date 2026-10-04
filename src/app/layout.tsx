import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quran Video Studio",
  description: "CSV → overlays → synced preview → rendered MP4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-muted/30">{children}</body>
    </html>
  );
}
