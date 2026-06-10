import type { Metadata } from "next";
import { Geist, Geist_Mono, Michroma, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// B&W 2.0 — display face for headers ("classified hardware" energy, still legible daily)
const michroma = Michroma({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

// CRT-flavored mono for HUD labels, serials, barcodes (data tables stay on Geist Mono)
const shareTechMono = Share_Tech_Mono({
  variable: "--font-hud",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal OS",
  description: "Personal AI operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${michroma.variable} ${shareTechMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
