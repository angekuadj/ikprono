"use client";

import { getFirebaseAuth, isFirebaseAuthConfigured } from "@/lib/firebaseAuth";

/**
 * Jeton d'identité Firebase de l'utilisateur connecté, à joindre aux requêtes API
 * protégées (`Authorization: Bearer <token>`). Renvoie null si personne n'est
 * connecté ou si Firebase n'est pas configuré.
 */
export async function getIdToken(): Promise<string | null> {
  if (!isFirebaseAuthConfigured()) return null;
  try {
    const current = getFirebaseAuth().currentUser;
    if (!current) return null;
    return await current.getIdToken();
  } catch (error) {
    console.error("Impossible d'obtenir le jeton d'identité Firebase.", error);
    return null;
  }
}

/** En-têtes (dont l'authentification) pour une requête API. */
export async function authorizedHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

/** Requête POST JSON vers une API, authentifiée si l'utilisateur est connecté. */
export async function postJson(
  url: string,
  body: unknown
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: await authorizedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

/** Requête GET authentifiée vers une API. */
export async function getJson(url: string): Promise<Response> {
  return fetch(url, {
    headers: await authorizedHeaders(),
    cache: "no-store",
  });
}
