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
import { getFirebaseApp } from "./firebase";

let dbInstance: Firestore | null = null;

/** Instance Firestore (client). */
export function getFirestoreDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
  }
  return dbInstance;
}

const USERS_COLLECTION = "users";

function toUser(id: string, data: DocumentData): User {
  return {
    id,
    email: typeof data.email === "string" ? data.email : "",
    name: typeof data.name === "string" ? data.name : "",
    role: data.role === "admin" ? "admin" : "user",
    plan:
      data.plan === "premium" || data.plan === "standard" ? data.plan : "standard",
    createdAt:
      typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
  };
}

/** Lit le profil Firestore d'un utilisateur. Renvoie null s'il n'existe pas. */
export async function getUserProfile(uid: string): Promise<User | null> {
  const snapshot = await getDoc(doc(getFirestoreDb(), USERS_COLLECTION, uid));
  if (!snapshot.exists()) return null;
  return toUser(`firebase:${uid}`, snapshot.data());
}

/**
 * Crée le profil Firestore si absent, ou le retourne s'il existe déjà.
 * Permet de préserver role/plan après une reconnexion.
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
  await setDoc(doc(getFirestoreDb(), USERS_COLLECTION, fbUser.uid), {
    email: created.email,
    name: created.name,
    role: created.role,
    plan: created.plan,
    createdAt: created.createdAt,
  });
  return created;
}

/** Met à jour partiellement le profil (nom, email, plan...). */
export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<User, "email" | "name" | "role" | "plan">>
): Promise<void> {
  await updateDoc(doc(getFirestoreDb(), USERS_COLLECTION, uid), patch);
}
