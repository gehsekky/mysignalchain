import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BetaBanner } from "@/components/beta-banner";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "mysignalchain",
  description: "Build, version and share your guitar signal chain.",
  // Until launch, nothing should be indexed. Remove at launch (M7).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "h-full font-sans antialiased",
      )}
    >
      <body className="flex min-h-full flex-col">
        <BetaBanner />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
