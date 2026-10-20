import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
  type DocumentData,
} from "firebase/firestore";
import type { User } from "@/context/AuthContext";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";

let dbInstance: Firestore | null = null;

/** Instance Firestore (client). Retourne null si Firebase n'est pas configuré. */
export function getFirestoreDb(): Firestore | null {
  if (!isFirebaseConfigured) {
    return null;
  }
  if (!dbInstance) {
    try {
      dbInstance = getFirestore(getFirebaseApp());
    } catch (error) {
      console.error("Impossible d'initialiser Firestore:", error);
      return null;
    }
  }
  return dbInstance;
}

const USERS_COLLECTION = "users";

function toUser(id: string, data: DocumentData): User {
  const role: User["role"] = data.role === "admin" ? "admin" : "user";
  return {
    id,
    email: typeof data.email === "string" ? data.email : "",
    name: typeof data.name === "string" ? data.name : "",
    role,
    // Premium à vie : le rôle admin implique toujours le plan premium,
    // quel que soit le champ stocké (les quotas illimités viennent du rôle).
    plan: role === "admin" || data.plan === "premium" ? "premium"
      : data.plan === "standard" ? "standard"
      : "standard",
    createdAt:
      typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
  };
}

/** Lit le profil Firestore d'un utilisateur. Renvoie null s'il n'existe pas ou si Firestore n'est pas disponible. */
export async function getUserProfile(uid: string): Promise<User | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  try {
    const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (!snapshot.exists()) return null;
    return toUser(`firebase:${uid}`, snapshot.data());
  } catch (error) {
    console.error("Erreur lors de la lecture du profil Firestore:", error);
    return null;
  }
}

/**
 * Crée le profil Firestore si absent, ou le retourne s'il existe déjà.
 * Permet de préserver role/plan après une reconnexion.
 * Si Firestore n'est pas disponible, crée un profil local.
 */
export async function ensureUserProfile(fbUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<User> {
  const existing = await getUserProfile(fbUser.uid);
  if (existing) return existing;

  const created: User = {
    id: `firebase:${fbUser.uid}`,
    email: fbUser.email?.trim().toLowerCase() ?? "",
    name: fbUser.displayName?.trim() || fbUser.email?.split("@")[0] || "Utilisateur",
    role: "user",
    plan: "standard",
    createdAt: new Date().toISOString(),
  };

  const db = getFirestoreDb();
  if (db) {
    try {
      await setDoc(doc(db, USERS_COLLECTION, fbUser.uid), {
        email: created.email,
        name: created.name,
        role: created.role,
        plan: created.plan,
        createdAt: created.createdAt,
      });
    } catch (error) {
      console.error("Erreur lors de la création du profil Firestore:", error);
      // Continue même si Firestore échoue, on utilise le profil local
    }
  }

  return created;
}

/** Met à jour partiellement le profil (nom, email, plan...). Ne fait rien si Firestore n'est pas disponible. */
export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<User, "email" | "name" | "role" | "plan">>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  try {
    await updateDoc(doc(db, USERS_COLLECTION, uid), patch);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du profil Firestore:", error);
  }
}
