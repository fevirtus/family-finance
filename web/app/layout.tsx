import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Finance",
  description: "Theo dõi chi tiêu gia đình",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
