import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://salse-growth.dreamchazer.chatgpt.site"),
  title: "Salse — Drive growth with confidence",
  description:
    "Understand customers, revenue, expenses, and performance clearly in one place.",
  openGraph: {
    title: "Salse — Drive growth with confidence",
    description: "Understand customers, revenue, expenses, and performance clearly in one place.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Salse business insights" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Salse — Drive growth with confidence",
    description: "Understand customers, revenue, expenses, and performance clearly in one place.",
    images: ["/og.png"],
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
