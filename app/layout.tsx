import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Loops Watch",
  description: "A private market workstation: heatmaps, research and watchlists, with every price labeled by its source and age.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme toggle saves the choice in a cookie so the page renders in the right colors straight away
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${theme === "dark" ? "dark " : ""}${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
