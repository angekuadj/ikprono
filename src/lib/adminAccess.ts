/**
 * Accès administration.
 *
 * Règle métier : seul le compte propriétaire (e-mail `admin@ikprono.com`)
 * dispose de l'accès administration, même si un autre compte portait le rôle
 * `admin` dans Firestore. Le contrôle est appliqué côté client (interface)
 * et côté serveur (`isAdminUser` dans `subscriptionStore`), qui fait foi.
 */

/** E-mail unique autorisé à accéder à l'espace administration. */
export const ADMIN_EMAIL = "admin@ikprono.com";

/** Vrai si `email` est l'e-mail administrateur (insensible à la casse). */
export function isAdminEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL;
}

interface AdminCandidate {
  role?: "user" | "admin";
  email?: string;
}

/** Vrai si l'utilisateur a à la fois le rôle admin et l'e-mail autorisé. */
export function hasAdminAccess(user: AdminCandidate | null | undefined): boolean {
  return !!user && user.role === "admin" && isAdminEmail(user.email);
}
