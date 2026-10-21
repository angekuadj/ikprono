import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Notification from "@/components/Notification";
import AppProviders from "@/components/AppProviders";
import FloatingBasketLink from "@/components/FloatingBasketLink";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IkProno - Calendrier sportif",
  description: "Parcourez les rencontres de football, basketball et tennis par jour, semaine ou mois.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ikprono.onrender.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.className} app-theme`}>
        <AppProviders>
          <Navigation />
          <main className="app-main min-h-screen">
            {children}
          </main>
          <Footer />
          <Notification />
          <FloatingBasketLink />
        </AppProviders>
      </body>
    </html>
  );
}
