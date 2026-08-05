import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find the Beat",
  description: "Solo practice and teacher-led team play for the elementary music classroom.",
  openGraph: {
    title: "Find the Beat",
    description: "Solo practice and teacher-led team play.",
    images: [{ url: "/og-team.png", width: 1792, height: 896, alt: "Find the Beat Team Mode" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find the Beat",
    description: "Solo practice and teacher-led team play.",
    images: ["/og-team.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
