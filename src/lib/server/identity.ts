import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Identification serveur des appelants.
 *
 * - Utilisateur connecté : jeton d'identité Firebase vérifié (signature RS256 via
 *   les clés publiques Google). Aucun SDK admin n'est nécessaire.
 * - Visiteur non connecté : identifiant anonyme porté par un cookie signé (HMAC),
 *   afin que le quota invité ne puisse pas être remis à zéro en vidant le stockage
 *   du navigateur.
 */

export type Principal =
  | { kind: "user"; uid: string }
  | { kind: "guest"; guestId: string };

const GUEST_COOKIE = "ikprono_guest";
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const JWKS_TTL_MS = 60 * 60 * 1000;

interface JwkKey {
  kid: string;
  n: string;
  e: string;
  [key: string]: unknown;
}

interface GoogleJwkSet {
  keys: JwkKey[];
}

interface FirebaseTokenPayload {
  sub?: unknown;
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
}

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;

async function loadGoogleKeys(): Promise<JwkKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(FIREBASE_JWKS_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Impossible de charger les clés publiques Firebase (${response.status}).`);
  }
  const body = (await response.json()) as GoogleJwkSet;
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error("Jeu de clés publiques Firebase invalide.");
  }
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function decodeJsonSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(base64UrlToBuffer(segment).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Vérifie un jeton d'identité Firebase : signature RS256, audience, émetteur et expiration.
 * Renvoie l'UID, ou null si le jeton est invalide.
 *
 * Le rôle n'est pas lu dans le jeton : il est vérifié côté serveur dans Firestore
 * (`users/{uid}.role`), afin qu'un utilisateur ne puisse pas s'attribuer le rôle admin.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<{ uid: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = decodeJsonSegment<{ alg?: string; kid?: string }>(encodedHeader);
  const payload = decodeJsonSegment<FirebaseTokenPayload>(encodedPayload);
  if (!header?.kid || header.alg !== "RS256" || !payload) return null;

  let keys: JwkKey[];
  try {
    keys = await loadGoogleKeys();
  } catch (error) {
    console.error("Vérification du jeton Firebase impossible.", error);
    return null;
  }
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) return null;

  try {
    const { createPublicKey, createVerify } = await import("node:crypto");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    if (!verifier.verify(publicKey, base64UrlToBuffer(encodedSignature))) return null;
  } catch (error) {
    console.error("Signature du jeton Firebase invalide.", error);
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;

  return { uid: payload.sub };
}

function guestSecret(): string {
  return (
    process.env.IKPRONO_GUEST_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "ikprono-dev-guest-secret"
  );
}

/** Signe un identifiant invité (HMAC-SHA256 tronqué) pour empêcher la falsification. */
function signGuestId(guestId: string): string {
  return createHmac("sha256", guestSecret()).update(guestId).digest("base64url").slice(0, 32);
}

function isValidGuestId(guestId: string, signature: string): boolean {
  const expected = signGuestId(guestId);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Identifie l'appelant d'une requête :
 *  1. jeton Firebase valide → utilisateur connecté ;
 *  2. cookie invité signé valide → visiteur connu ;
 *  3. sinon → nouvel invité (le cookie devra être posé par `applyGuestCookie`).
 */
export async function identifyRequest(
  request: NextRequest
): Promise<{ principal: Principal; issuedGuestId: string | null }> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";

  if (bearer && projectId) {
    const decoded = await verifyFirebaseIdToken(bearer, projectId);
    if (decoded) {
      return { principal: { kind: "user", uid: decoded.uid }, issuedGuestId: null };
    }
  }

  const cookie = request.cookies.get(GUEST_COOKIE)?.value ?? "";
  const separator = cookie.lastIndexOf(".");
  if (separator > 0) {
    const guestId = cookie.slice(0, separator);
    const signature = cookie.slice(separator + 1);
    if (isValidGuestId(guestId, signature)) {
      return { principal: { kind: "guest", guestId }, issuedGuestId: null };
    }
  }

  const issuedGuestId = crypto.randomUUID();
  return { principal: { kind: "guest", guestId: issuedGuestId }, issuedGuestId };
}

/** Pose le cookie invité signé (uniquement quand un nouvel identifiant a été créé). */
export function applyGuestCookie(response: NextResponse, issuedGuestId: string | null): NextResponse {
  if (!issuedGuestId) return response;
  response.cookies.set({
    name: GUEST_COOKIE,
    value: `${issuedGuestId}.${signGuestId(issuedGuestId)}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

/** Clé de compte stable utilisée pour l'abonnement et les quotas. */
export function principalKey(principal: Principal): string {
  return principal.kind === "user" ? `firebase:${principal.uid}` : `guest:${principal.guestId}`;
}
