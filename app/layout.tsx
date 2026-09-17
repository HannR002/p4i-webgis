import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "P4I Spatial Analytics",
  description: "Platform analitik spasial dan kajian risiko P4I Consultant",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
