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
  title: "IkProno - Prédictions Sportives par IA",
  description: "Application de prédictions sportives alimentée par l'intelligence artificielle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
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
