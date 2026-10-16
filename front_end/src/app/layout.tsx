import type { Metadata } from "next";
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/shell";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["600", "700", "800"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InsureAI · New Customers",
  description: "AI prospecting, risk checks, product matching and next steps, with human approval",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jakarta.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
