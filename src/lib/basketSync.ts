import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firestore";
import {
  isFixture,
  readFixtureBasket,
  subscribeToFixtureBasket,
  writeFixtureBasket,
} from "@/lib/fixtureBasket";
import {
  isMarketSelection,
  readMarketSelections,
  subscribeToMarketSelections,
  writeMarketSelections,
  type MarketSelectionsByFixture,
} from "@/lib/marketSelections";
import {
  isStoredGeneratedCombination,
  readGeneratedCombinations,
  subscribeToGeneratedCombinations,
  writeGeneratedCombinations,
  type StoredGeneratedCombination,
} from "@/lib/generatedCombinations";
import type { Fixture } from "@/lib/fixtures";

/**
 * Synchronisation du panier avec Firestore pour les comptes connectés.
 *
 * Le panier vit dans le localStorage (réactif, disponible hors ligne) et est
 * mirroré dans `users/{uid}/data/basket` pour être retrouvé sur tous les
 * appareils de l'utilisateur. Deux choses sont synchronisées :
 *  - les combinaisons **déjà générées** (le panier à proprement parler) ;
 *  - les matchs sélectionnés et leurs sélections de marchés.
 *
 * Les règles Firestore autorisent le propriétaire à lire/écrire ses documents
 * `data/*` (hors `subscription`, réservé serveur).
 *
 * Politique de fusion : l'union des deux paniers, le local l'emportant sur le
 * distant pour une même entrée. Les écritures locales sont repoussées vers le
 * serveur avec un léger debounce.
 */

const BASKET_DOC_KEY = "basket";
const PUSH_DEBOUNCE_MS = 800;
const MAX_FIXTURES = 20;

export interface RemoteBasket {
  fixtures: Fixture[];
  selections: MarketSelectionsByFixture;
  /** Combinaisons déjà générées (le panier). */
  generated: StoredGeneratedCombination[];
  updatedAt: string;
}

function uidFromAccountId(accountId: string): string | null {
  return accountId.startsWith("firebase:") ? accountId.slice("firebase:".length) : null;
}

function isMarketSelectionsByFixture(value: unknown): value is MarketSelectionsByFixture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    selections => Array.isArray(selections) && selections.every(isMarketSelection)
  );
}

/** Lit le panier distant de l'utilisateur. Renvoie null s'il est absent ou illisible. */
export async function loadRemoteBasket(uid: string): Promise<RemoteBasket | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  try {
    const snapshot = await getDoc(doc(db, "users", uid, "data", BASKET_DOC_KEY));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Record<string, unknown>;
    const fixtures = Array.isArray(data.fixtures) ? data.fixtures.filter(isFixture) : null;
    if (!fixtures || !isMarketSelectionsByFixture(data.selections)) return null;
    return {
      fixtures: fixtures.slice(0, MAX_FIXTURES),
      selections: data.selections,
      generated: Array.isArray(data.generated)
        ? data.generated.filter(isStoredGeneratedCombination)
        : [],
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
    };
  } catch (error) {
    console.error("Lecture du panier distant impossible.", error);
    return null;
  }
}

/** Pousse le panier local vers Firestore (silencieux si Firebase est absent). */
export async function pushRemoteBasket(uid: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  try {
    const payload: RemoteBasket = {
      fixtures: readFixtureBasket(),
      selections: readMarketSelections(),
      generated: readGeneratedCombinations(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", uid, "data", BASKET_DOC_KEY), payload);
  } catch (error) {
    console.error("Sauvegarde du panier distant impossible.", error);
  }
}

/** Fusionne deux paniers : union par identifiant de match, le local l'emportant. */
function mergeBaskets(local: Fixture[], remote: Fixture[]): Fixture[] {
  const seen = new Set(local.map(fixture => fixture.id));
  const merged = [...local];
  for (const fixture of remote) {
    if (seen.has(fixture.id)) continue;
    seen.add(fixture.id);
    merged.push(fixture);
  }
  return merged.slice(0, MAX_FIXTURES);
}

/** Fusionne deux sélections de marchés, les sélections locales l'emportant. */
function mergeSelections(
  local: MarketSelectionsByFixture,
  remote: MarketSelectionsByFixture
): MarketSelectionsByFixture {
  const merged: MarketSelectionsByFixture = { ...remote };
  for (const [fixtureId, selections] of Object.entries(local)) {
    const remoteSelections = merged[fixtureId] ?? [];
    const byMarket = new Map(remoteSelections.map(selection => [selection.market, selection]));
    for (const selection of selections) byMarket.set(selection.market, selection);
    merged[fixtureId] = Array.from(byMarket.values());
  }
  return merged;
}

/** Fusionne deux listes de combinaisons déjà générées, par identifiant (local prioritaire). */
function mergeGenerated(
  local: StoredGeneratedCombination[],
  remote: StoredGeneratedCombination[]
): StoredGeneratedCombination[] {
  const seen = new Set(local.map(combination => combination.id));
  const merged = [...local];
  for (const combination of remote) {
    if (seen.has(combination.id)) continue;
    seen.add(combination.id);
    merged.push(combination);
  }
  return merged;
}

/**
 * Démarre la synchronisation du panier pour le compte `accountId`.
 *
 * Au démarrage : fusion locale ↔ distant puis repousoir du résultat.
 * Ensuite : chaque modification locale est repoussée (debounce).
 * Renvoie la fonction d'arrêt.
 */
export function startBasketSync(accountId: string): () => void {
  const uid = uidFromAccountId(accountId);
  if (!uid || typeof window === "undefined") return () => {};

  let disposed = false;
  let pushTimeout: ReturnType<typeof setTimeout> | null = null;

  const schedulePush = () => {
    if (disposed) return;
    if (pushTimeout) clearTimeout(pushTimeout);
    pushTimeout = setTimeout(() => {
      pushTimeout = null;
      if (!disposed) void pushRemoteBasket(uid);
    }, PUSH_DEBOUNCE_MS);
  };

  const mergeAndPush = async () => {
    const remote = await loadRemoteBasket(uid);
    if (disposed) return;
    if (remote) {
      const mergedFixtures = mergeBaskets(readFixtureBasket(), remote.fixtures);
      const mergedSelections = mergeSelections(readMarketSelections(), remote.selections);
      const mergedGenerated = mergeGenerated(readGeneratedCombinations(), remote.generated);
      const localFixtures = readFixtureBasket();
      const fixturesChanged =
        mergedFixtures.length !== localFixtures.length ||
        mergedFixtures.some((fixture, index) => fixture.id !== localFixtures[index]?.id);
      if (fixturesChanged) writeFixtureBasket(mergedFixtures);
      writeMarketSelections(mergedSelections);
      const localGenerated = readGeneratedCombinations();
      const generatedChanged =
        mergedGenerated.length !== localGenerated.length ||
        mergedGenerated.some((combination, index) => combination.id !== localGenerated[index]?.id);
      if (generatedChanged) writeGeneratedCombinations(mergedGenerated);
    }
    schedulePush();
  };

  void mergeAndPush();

  const unsubscribeFixtures = subscribeToFixtureBasket(schedulePush);
  const unsubscribeSelections = subscribeToMarketSelections(schedulePush);
  const unsubscribeGenerated = subscribeToGeneratedCombinations(schedulePush);

  return () => {
    disposed = true;
    if (pushTimeout) clearTimeout(pushTimeout);
    unsubscribeFixtures();
    unsubscribeSelections();
    unsubscribeGenerated();
  };
}
