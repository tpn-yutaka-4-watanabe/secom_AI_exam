import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "グレード4認定試験",
    template: "%s｜グレード4認定試験",
  },
  description: "動画確認と顧客メール対応で構成されるグレード4認定試験",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
