"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import logo from "../../assets/ikprono-logo.png";

export default function Footer() {
  const { text } = useLanguage();
  return (
    <footer className="site-footer bg-black border-t border-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <Image src={logo} alt="IkProno" width={180} height={52} className="mb-4 h-12 w-auto" />
            <p className="text-gray-400 text-sm">
              {text("Le calendrier des rencontres, à votre rythme.", "The fixture calendar, on your schedule.")}
            </p>
            <div className="mt-3">
              <p className="text-sm font-medium text-green-400">
                {text("Bientôt disponible", "Coming soon")}
              </p>
              <div className="mt-2 flex items-center gap-3 text-gray-400" aria-label="Android et iOS">
                <svg role="img" aria-label="Android" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0001s.4482-1.0001.9993-1.0001c.5511 0 .9993.4486.9993 1.0001s-.4482 1.0001-.9993 1.0001m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0001s.4482-1.0001.9993-1.0001c.5511 0 .9993.4486.9993 1.0001s-.4482 1.0001-.9993 1.0001m11.4045-6.02 1.9973-3.4592a.416.416 0 0 0-.1521-.5676.416.416 0 0 0-.5678.1521l-2.0223 3.5021a12.1865 12.1865 0 0 0-10.2732 0L4.8411 5.4467a.4161.4161 0 0 0-.72.4154l1.9972 3.4593C2.6889 11.2175.845 14.6022.605 18.396h22.79c-.24-3.7938-2.0839-7.1785-5.5135-9.0746" />
                </svg>
                <svg role="img" aria-label="Apple" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                  <path d="M16.365 1.43c0 1.14-.416 2.22-1.247 3.236-.998 1.202-2.205 1.896-3.512 1.79a3.6 3.6 0 0 1-.027-.44c0-1.095.477-2.267 1.323-3.226 1.056-1.213 2.38-1.907 3.463-1.98.027.207.04.414.04.62M21.94 17.18c-.383.88-.84 1.69-1.37 2.44-.72 1.02-1.31 1.73-1.77 2.14-.71.66-1.47 1-2.27 1-.58 0-1.28-.17-2.1-.52-.82-.35-1.57-.52-2.25-.52-.71 0-1.48.17-2.3.52-.83.35-1.5.53-2.02.55-.77.03-1.55-.32-2.34-1.05-.5-.44-1.12-1.18-1.86-2.21-.79-1.1-1.44-2.38-1.96-3.84-.56-1.58-.84-3.11-.84-4.61 0-1.7.37-3.16 1.1-4.38.58-.99 1.35-1.77 2.31-2.34a6.24 6.24 0 0 1 3.15-.89c.62 0 1.43.2 2.43.59.99.4 1.63.6 1.9.6.2 0 .9-.23 2.1-.7 1.13-.43 2.08-.61 2.86-.54 2.11.17 3.69 1.01 4.72 2.53-1.89 1.14-2.82 2.73-2.8 4.78.02 1.6.6 2.93 1.74 3.99.51.47 1.08.84 1.72 1.1-.14.4-.28.78-.43 1.15" />
                </svg>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4">{text("Navigation", "Navigation")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Accueil", "Home")}
                </Link>
              </li>
              <li>
                <Link href="/predictions" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Rencontres", "Fixtures")}
                </Link>
              </li>
              <li>
                <Link href="/live" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Calendrier", "Schedule")}
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Dashboard", "Dashboard")}
                </Link>
              </li>
              <li>
                <Link href="/lottery" className="text-green-500 hover:text-green-400 transition text-sm animate-heartbeat">
                  🎰 {text("Lotteries", "Lotteries")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-white mb-4">{text("Support", "Support")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/faq" className="text-gray-400 hover:text-white transition text-sm">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Contact", "Contact")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Conditions d'utilisation", "Terms of service")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-gray-400 hover:text-white transition text-sm">
                  {text("Politique de confidentialité", "Privacy policy")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="font-semibold text-white mb-4">{text("Suivez-nous", "Follow us")}</h3>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              {text("© 2026 IkProno - Tous droits réservés", "© 2026 IkProno - All rights reserved")}
            </p>
            <p className="text-gray-500 text-xs mt-2 md:mt-0">
              {text("Les rencontres proviennent de fournisseurs de données sportives.", "Fixtures are provided by sports data services.")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
