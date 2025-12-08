import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cup Simulator - Device Visualization",
  description: "3D device rhythm visualization simulator with real-time data streaming.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

