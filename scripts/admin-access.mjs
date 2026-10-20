#!/usr/bin/env node
/**
 * Diagnostic et réparation de l'accès administrateur IkProno.
 *
 * Pourquoi ce script existe :
 *   Le rôle admin (`users/{uid}.role`) est lu dans Firestore, côté client, au
 *   moment de la connexion — et il n'est jamais rafraîchi ensuite. Une session
 *   ouverte avant l'attribution du rôle reste donc bloquée sur "user", et les
 *   pages /admin restent invisibles (menu absent + redirection).
 *
 * Ce script lit l'état RÉEL dans Firebase (Authentication + Firestore) et
 * explique précisément ce qui bloque : UID, fournisseur de connexion, rôle
 * Firestore, et cohérence entre les deux.
 *
 * Il réutilise les jetons OAuth déjà enregistrés par la Firebase CLI sur cette
 * machine (`~/.config/configstore/firebase-tools.json`) : aucune clé de compte
 * de service n'est nécessaire. Si le jeton est expiré, il est rafraîchi
 * automatiquement avec le refresh_token.
 *
 * Utilisation :
 *   node scripts/admin-access.mjs                      # diagnostic complet
 *   node scripts/admin-access.mjs --email autreadresse # cible un autre compte
 *   node scripts/admin-access.mjs --set-role admin     # écrit le rôle dans Firestore
 *   node scripts/admin-access.mjs --send-reset         # envoie un e-mail de réinitialisation
 *   node scripts/admin-access.mjs --help
 *
 * Aucune donnée sensible n'est affichée : seuls les identifiants techniques et
 * les rôles le sont.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_EMAIL = "admin@ikprono.com";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "ikprono-84863";
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";
const FIREBASE_TOOLS_CONFIG = path.join(
  os.homedir(),
  ".config",
  "configstore",
  "firebase-tools.json"
);

/** Lit le fichier .env du projet sans dépendance externe. */
function readEnvFile(file = path.join(process.cwd(), ".env")) {
  try {
    const content = fs.readFileSync(file, "utf8");
    const values = {};
    for (const line of content.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    return values;
  } catch {
    return {};
  }
}

/**
 * Jeton d'accès Google, réutilisé depuis la Firebase CLI.
 * Rafraîchit le jeton s'il a expiré, à partir du refresh_token.
 */
async function getAccessToken() {
  if (!fs.existsSync(FIREBASE_TOOLS_CONFIG)) {
    throw new Error(
      `Configuration Firebase CLI introuvable (${FIREBASE_TOOLS_CONFIG}).\n` +
        "Lancez d'abord : firebase login"
    );
  }
  const tokens = JSON.parse(fs.readFileSync(FIREBASE_TOOLS_CONFIG, "utf8")).tokens || {};
  const expiresAt = Number(tokens.expires_at) || 0;

  if (tokens.access_token && Date.now() < expiresAt - 60_000) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    throw new Error("Jeton expiré et aucun refresh_token disponible. Lancez : firebase login");
  }

  const env = readEnvFile();
  const clientId = env.NEXT_PUBLIC_FIREBASE_CLIENT_ID || env.FIREBASE_CLIENT_ID;
  const clientSecret = env.NEXT_PUBLIC_FIREBASE_CLIENT_SECRET || env.FIREBASE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Jeton expiré. Relancez simplement : firebase login\n" +
        "(le rafraîchissement automatique nécessite FIREBASE_CLIENT_ID / FIREBASE_CLIENT_SECRET)"
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error("Rafraîchissement du jeton impossible. Relancez : firebase login");
  }

  tokens.access_token = payload.access_token;
  tokens.expires_at = Date.now() + (Number(payload.expires_in) || 3600) * 1000;
  const config = JSON.parse(fs.readFileSync(FIREBASE_TOOLS_CONFIG, "utf8"));
  config.tokens = tokens;
  fs.writeFileSync(FIREBASE_TOOLS_CONFIG, JSON.stringify(config, null, 2));
  return tokens.access_token;
}

/** Comptes Firebase Authentication du projet. */
async function listAuthUsers(token) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet?maxResults=1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw new Error(`Lecture des comptes impossible (HTTP ${response.status}).`);
  }
  return (await response.json()).users || [];
}

/** Lit `users/{uid}` dans Firestore. Renvoie null si le document n'existe pas. */
async function getFirestoreUser(token, uid) {
  const response = await fetch(
    `${FIRESTORE_BASE}/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Lecture Firestore impossible (HTTP ${response.status}).`);
  }
  const payload = await response.json();
  const fields = payload.fields || {};
  return {
    role: fields.role?.stringValue ?? null,
    plan: fields.plan?.stringValue ?? null,
    email: fields.email?.stringValue ?? null,
    name: fields.name?.stringValue ?? null,
    createdAt: fields.createdAt?.stringValue ?? null,
    updateTime: payload.updateTime ?? null,
  };
}

/**
 * Écrit le rôle (et le plan) dans `users/{uid}`.
 * Utilise une mise à jour ciblée : les autres champs ne sont pas touchés.
 */
async function setFirestoreRole(token, uid, role) {
  const mask = "updateMask.fieldPaths=role&updateMask.fieldPaths=plan";
  const response = await fetch(
    `${FIRESTORE_BASE}/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?${mask}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          role: { stringValue: role },
          plan: { stringValue: role === "admin" ? "premium" : "standard" },
        },
      }),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Écriture Firestore impossible (HTTP ${response.status}) : ${detail.slice(0, 200)}`);
  }
  return true;
}

/** Déclenche l'e-mail de réinitialisation de mot de passe (nécessite la clé Web). */
async function sendPasswordReset(email) {
  const env = readEnvFile();
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY absente de .env : réinitialisation impossible.");
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || `Échec de l'envoi (HTTP ${response.status}).`);
  }
  return true;
}

function printHelp() {
  console.log(`
Diagnostic de l'accès administrateur IkProno (projet ${PROJECT_ID})

  node scripts/admin-access.mjs                     Diagnostic du compte admin par défaut
  node scripts/admin-access.mjs --email <adresse>   Diagnostic d'un autre compte
  node scripts/admin-access.mjs --set-role admin    Attribue le rôle admin dans Firestore
  node scripts/admin-access.mjs --set-role user     Retire le rôle admin
  node scripts/admin-access.mjs --send-reset        Envoie un e-mail de réinitialisation
  node scripts/admin-access.mjs --help              Affiche cette aide

Le script réutilise la connexion de la Firebase CLI : lancez 'firebase login'
si ce n'est pas déjà fait.
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const emailIndex = args.indexOf("--email");
  const email = (emailIndex >= 0 ? args[emailIndex + 1] : DEFAULT_EMAIL).trim().toLowerCase();

  const roleIndex = args.indexOf("--set-role");
  const newRole = roleIndex >= 0 ? args[roleIndex + 1] : null;
  if (newRole !== null && newRole !== "admin" && newRole !== "user") {
    throw new Error("--set-role attend 'admin' ou 'user'.");
  }

  const token = await getAccessToken();
  const authUsers = await listAuthUsers(token);
  const account = authUsers.find(user => (user.email || "").toLowerCase() === email);

  console.log(`\n=== IkProno · accès administrateur (${PROJECT_ID}) ===\n`);

  if (!account) {
    console.log(`✗ Aucun compte Firebase Authentication pour « ${email} ».`);
    console.log("  Créez-le d'abord via l'application (inscription) ou la console Firebase.");
    return;
  }

  const providers = (account.providerUserInfo || []).map(item => item.providerId).filter(Boolean);
  console.log(`Compte        : ${account.email}`);
  console.log(`UID           : ${account.localId}`);
  console.log(`Connexion     : ${providers.length ? providers.join(", ") : "mot de passe"}`);

  const document = await getFirestoreUser(token, account.localId);
  if (!document) {
    console.log("\n✗ Document Firestore users/" + account.localId + " introuvable.");
    console.log("  → Connectez-vous une fois à l'application pour le créer, ou lancez --set-role admin.");
    return;
  }

  console.log(`Rôle Firestore: ${document.role ?? "(absent)"}`);
  console.log(`Plan Firestore: ${document.plan ?? "(absent)"}`);
  console.log(`Nom           : ${document.name ?? "—"}`);

  console.log("");
  if (document.role === "admin") {
    console.log("✓ Le rôle admin est bien présent dans Firestore.");
    console.log("");
    console.log("Si les pages /admin restent invisibles :");
    console.log("  1. Déconnectez-vous PUIS reconnectez-vous (le rôle n'est lu qu'à la connexion).");
    if (!providers.some(provider => provider === "google.com")) {
      console.log("  2. Ce compte se connecte par MOT DE PASSE, pas par Google :");
      console.log("     utilisez le formulaire e-mail + mot de passe, pas le bouton Google.");
    }
    console.log("  3. Videz le cache du navigateur si le profil est resté en mémoire.");
  } else {
    console.log("✗ Le rôle admin est ABSENT : c'est la cause du blocage.");
    console.log("  → Lancez : node scripts/admin-access.mjs --email " + email + " --set-role admin");
  }

  if (newRole !== null) {
    await setFirestoreRole(token, account.localId, newRole);
    console.log(`\n✓ Rôle écrit dans Firestore : ${newRole} (plan : ${newRole === "admin" ? "premium" : "standard"}).`);
    console.log("  Déconnectez-vous puis reconnectez-vous pour que le changement soit pris en compte.");
  }

  if (args.includes("--send-reset")) {
    await sendPasswordReset(email);
    console.log(`\n✓ E-mail de réinitialisation envoyé à ${email}.`);
  }

  console.log("");
}

main().catch(error => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
