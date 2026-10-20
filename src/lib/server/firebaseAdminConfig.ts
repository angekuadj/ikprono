import { getApps, initializeApp, applicationDefault, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Configuration centralisée de Firebase Admin SDK.
 *
 * Ce module gère l'initialisation de Firebase Admin avec deux méthodes :
 * 1. Variables d'environnement individuelles (RECOMMENDÉ pour Render/production)
 *    - FIREBASE_PROJECT_ID
 *    - FIREBASE_CLIENT_EMAIL
 *    - FIREBASE_PRIVATE_KEY
 * 2. GOOGLE_APPLICATION_CREDENTIALS (développement local)
 *    - Chemin vers le fichier JSON du compte de service
 */

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminUnavailable = false;

/**
 * Initialise Firebase Admin avec les identifiants disponibles.
 *
 * Ordre de priorité :
 * 1. Variables d'environnement individuelles (Render)
 * 2. GOOGLE_APPLICATION_CREDENTIALS (développement local)
 * 3. Identifiants par défaut Google Cloud (environnement Cloud)
 */
function initializeAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  // Priorité 1 : Variables d'environnement individuelles (Render)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    console.log("🔐 Firebase Admin initialisé via variables d'environnement");
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  // Priorité 2 : GOOGLE_APPLICATION_CREDENTIALS (développement local)
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialPath) {
    console.log("🔐 Firebase Admin initialisé via GOOGLE_APPLICATION_CREDENTIALS");
    return initializeApp({ credential: applicationDefault() });
  }

  // Priorité 3 : Identifiants par défaut Google Cloud
  console.log("🔐 Firebase Admin initialisé via identifiants par défaut Google Cloud");
  return initializeApp({ credential: applicationDefault() });
}

/**
 * Récupère l'instance Firestore Admin.
 *
 * Renvoie null si Firebase Admin n'est pas configuré (mode développement local).
 * L'appelant doit gérer ce cas en retombant sur le mode démo (quota côté client).
 */
export function getAdminDb(): Firestore | null {
  if (adminDb) return adminDb;
  if (adminUnavailable) return null;

  try {
    adminApp = initializeAdminApp();
    adminDb = getFirestore(adminApp);
    return adminDb;
  } catch (error) {
    adminUnavailable = true;
    console.warn(
      "⚠️  Firebase Admin indisponible : le quota est géré côté client (mode local).",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Vérifie si Firebase Admin est correctement configuré.
 *
 * Effectue une requête test pour confirmer que les identifiants sont valides.
 * Le résultat est mis en cache pour éviter des requêtes inutiles.
 */
let configurationChecked = false;
let configurationValid = false;

export async function isAdminConfigured(): Promise<boolean> {
  if (configurationChecked) return configurationValid;
  if (adminUnavailable) return false;

  const db = getAdminDb();
  if (!db) {
    configurationChecked = true;
    return false;
  }

  try {
    // Requête test : échoue immédiatement si les identifiants sont invalides
    await db.collection("subscriptions").doc("healthcheck").get();
    configurationChecked = true;
    configurationValid = true;
    console.log("✅ Firebase Admin configuration validée");
    return true;
  } catch (error) {
    adminUnavailable = true;
    configurationChecked = true;
    configurationValid = false;
    console.warn(
      "⚠️  Firebase Admin configuration invalide :",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

/**
 * Réinitialise l'instance Admin (utile pour les tests).
 * Note: Firebase Admin ne permet pas de supprimer manuellement l'instance,
 * cette fonction réinitialise seulement les variables locales.
 */
export function resetAdminApp(): void {
  adminApp = null;
  adminDb = null;
  adminUnavailable = false;
  configurationChecked = false;
  configurationValid = false;
}
