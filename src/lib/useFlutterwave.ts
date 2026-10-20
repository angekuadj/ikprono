"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chargement de la modale de paiement Flutterwave (Inline v3).
 *
 * Le script officiel `checkout.flutterwave.com/v3.js` expose
 * `window.FlutterwaveCheckout(options)` : il ouvre une modale hébergée par
 * Flutterwave par-dessus la page. Aucune clé secrète n'est utilisée ici — seule la
 * clé publique transite par le navigateur, ce qui est prévu par Flutterwave.
 */

const SCRIPT_ID = "flutterwave-v3-sdk";
const SCRIPT_SRC = "https://checkout.flutterwave.com/v3.js";

export interface FlutterwaveInlineOptions {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  payment_options?: string;
  redirect_url?: string;
  customer: { email: string; name?: string; phone_number?: string };
  customizations?: { title?: string; description?: string; logo?: string };
  meta?: Record<string, string | number>;
  callback: (response: FlutterwaveCallbackResponse) => void;
  onclose: () => void;
}

/** Réponse renvoyée par la modale après un paiement. */
export interface FlutterwaveCallbackResponse {
  status?: string;
  tx_ref?: string;
  transaction_id?: number | string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    FlutterwaveCheckout?: (options: FlutterwaveInlineOptions) => void;
  }
}

type ScriptState = "idle" | "loading" | "ready" | "error";

/** Charge le script Flutterwave une seule fois et indique son état. */
export function useFlutterwaveScript(): { state: ScriptState; load: () => void } {
  const [state, setState] = useState<ScriptState>("idle");
  const loadStarted = useRef(false);

  const load = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.FlutterwaveCheckout) {
      setState("ready");
      return;
    }
    if (loadStarted.current) return;
    loadStarted.current = true;

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.FlutterwaveCheckout) setState("ready");
      return;
    }

    setState("loading");
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => setState("ready");
    script.onerror = () => setState("error");
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, load };
}
