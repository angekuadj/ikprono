"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasAdminAccess } from "@/lib/adminAccess";

const links = [
  { href: "/admin", label: "Vue d’ensemble" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/offers", label: "Offres" },
  { href: "/admin/stats", label: "Statistiques" },
  { href: "/admin/payments", label: "Paiements" }
];

export default function AdminSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Seul le compte administrateur autorisé (e-mail dédié) accède aux pages admin.
  const adminAllowed = hasAdminAccess(user);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !adminAllowed)) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router, adminAllowed]);

  if (isLoading || !isAuthenticated || !adminAllowed) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center">
        <div className="admin-spinner h-12 w-12 rounded-full border-2 border-white/10" />
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="admin-container mx-auto max-w-7xl">
        <header className="admin-heading mb-7">
          <div className="admin-eyebrow mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]">
            <span className="admin-live-dot h-1.5 w-1.5 rounded-full" />
            Espace administration
          </div>
          <h1 className="admin-title text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="admin-description mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            {description}
          </p>
        </header>
        <nav
          aria-label="Navigation administration"
          className="admin-nav mb-8 flex max-w-full gap-1.5 overflow-x-auto rounded-2xl p-1.5"
        >
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`admin-nav-link shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                pathname === link.href
                  ? "admin-nav-active text-white"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div key={pathname} className="admin-content">
          {children}
        </div>
      </div>
    </div>
  );
}
