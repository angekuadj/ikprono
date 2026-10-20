import type { User } from "@/context/AuthContext";

export interface AdminPayment {
  id: string;
  userEmail: string;
  plan: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed";
  createdAt: string;
  method: string;
}

const USERS_STORAGE_KEY = "ikprono_users";
const PAYMENTS_STORAGE_KEY = "ikprono_payment_history";

export const DEMO_USERS: User[] = [
  {
    id: "1",
    email: "user@ikprono.com",
    name: "Utilisateur Test",
    role: "user",
    createdAt: "2026-10-01T00:00:00Z"
  },
  {
    id: "gpD540FgRnM7rfR0EbC0zOO0xpf1",
    email: "admin@ikprono.com",
    name: "Administrateur",
    role: "admin",
    createdAt: "2026-09-01T00:00:00Z"
  }
];

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<User>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.name === "string" &&
    (candidate.role === "user" || candidate.role === "admin") &&
    typeof candidate.createdAt === "string"
  );
}

export function readAdminUsers(): User[] {
  const value = localStorage.getItem(USERS_STORAGE_KEY);
  if (!value) return [...DEMO_USERS];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Le registre des utilisateurs est invalide.");
  }

  const users = parsed.map((account: unknown) => {
    if (
      typeof account !== "object" ||
      account === null ||
      !("user" in account) ||
      !isUser(account.user)
    ) {
      throw new Error("Le registre contient un compte invalide.");
    }
    return account.user;
  });

  return [...DEMO_USERS, ...users.filter(
    account => !DEMO_USERS.some(demo => demo.email === account.email)
  )];
}

export function readAdminPayments(): AdminPayment[] {
  const value = localStorage.getItem(PAYMENTS_STORAGE_KEY);
  if (!value) return [];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("L’historique des paiements est invalide.");
  }

  return parsed.map((payment: unknown) => {
    if (
      typeof payment !== "object" ||
      payment === null ||
      !("id" in payment) ||
      typeof payment.id !== "string" ||
      !("userEmail" in payment) ||
      typeof payment.userEmail !== "string" ||
      !("plan" in payment) ||
      typeof payment.plan !== "string" ||
      !("amount" in payment) ||
      typeof payment.amount !== "number" ||
      !("currency" in payment) ||
      typeof payment.currency !== "string" ||
      !("status" in payment) ||
      !["paid", "pending", "failed"].includes(String(payment.status)) ||
      !("createdAt" in payment) ||
      typeof payment.createdAt !== "string" ||
      !("method" in payment) ||
      typeof payment.method !== "string"
    ) {
      throw new Error("L’historique contient un paiement invalide.");
    }
    return payment as AdminPayment;
  });
}

export function writeAdminUsers(users: User[]): void {
  const accountsValue = localStorage.getItem(USERS_STORAGE_KEY);
  const accounts: unknown = accountsValue ? JSON.parse(accountsValue) : [];
  if (!Array.isArray(accounts)) {
    throw new Error("Le registre des utilisateurs est invalide.");
  }
  const remainingAccounts = accounts.filter((account: unknown) => {
    if (
      typeof account !== "object" ||
      account === null ||
      !("user" in account) ||
      !isUser(account.user)
    ) {
      return true;
    }
    const accountUser = account.user;
    return users.some(user => user.id === accountUser.id);
  });
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(remainingAccounts));
}
