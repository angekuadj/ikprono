import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  type Auth,
  type UserCredential,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";

let authInstance: Auth | null = null;

/** Instance Firebase Auth (client). Lance une erreur si Firebase n'est pas configuré. */
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

export function isFirebaseAuthConfigured(): boolean {
  return isFirebaseConfigured;
}

/**
 * Connexion Google via popup Firebase.
 * Nécessite d'activer le provider Google dans la console Firebase
 * (Authentication > Sign-in method > Google) et d'ajouter l'URL d'origine
 * autorisée dans Settings > Authorized domains.
 */
export async function signInWithGooglePopup(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(getFirebaseAuth(), provider);
}

/**
 * Convertit un message d'erreur Firebase en message utilisateur francophone.
 */
export function translateFirebaseError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "Adresse e-mail invalide.";
    case "auth/user-disabled":
      return "Ce compte a été désactivé.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email ou mot de passe incorrect.";
    case "auth/email-already-in-use":
      return "Un compte utilise déjà cette adresse email.";
    case "auth/weak-password":
      return "Le mot de passe doit contenir au moins 6 caractères.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayez plus tard.";
    case "auth/network-request-failed":
      return "Erreur réseau. Vérifiez votre connexion.";
    case "auth/popup-closed-by-user":
      return "La fenêtre de connexion a été fermée.";
    case "auth/operation-not-allowed":
      return "Méthode de connexion non activée dans la console Firebase.";
    case "auth/configuration-not-found":
      return "Méthode de connexion non configurée (provider désactivé).";
    default:
      if (error instanceof Error && error.message) return error.message;
      return "Une erreur est survenue lors de l'authentification.";
  }
}

/** UID Firebase → identifiant stable utilisé côté app. */
export function firebaseUserId(fbUser: FirebaseUser): string {
  return `firebase:${fbUser.uid}`;
}
