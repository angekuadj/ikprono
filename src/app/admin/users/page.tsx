"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@/context/AuthContext";
import AdminSection from "@/components/AdminSection";
import { DEMO_USERS, readAdminUsers, writeAdminUsers } from "@/lib/adminData";
import { useLanguage } from "@/context/LanguageContext";

export default function AdminUsersPage() {
  const { language, text } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setUsers(readAdminUsers());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : text("Impossible de charger les utilisateurs.", "Unable to load users.")
      );
    }
  }, [text]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    );
  }, [search, users]);

  const removeUser = (target: User) => {
    if (
      DEMO_USERS.some(user => user.id === target.id) ||
      target.role === "admin"
    ) {
      return;
    }
    if (!window.confirm(`${text("Supprimer le compte de", "Delete the account of")} ${target.name}?`)) return;

    try {
      const updatedUsers = users.filter(user => user.id !== target.id);
      writeAdminUsers(updatedUsers);
      setUsers(updatedUsers);
      setError("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : text("Impossible de supprimer cet utilisateur.", "Unable to delete this user.")
      );
    }
  };

  return (
    <AdminSection
      title={text("Gestion des utilisateurs", "User management")}
      description={text("Consultez les comptes et supprimez les comptes standards enregistrés sur cet appareil.", "View accounts and delete Standard accounts stored on this device.")}
    >
      <section className="admin-panel animate-slide-up overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{text("Comptes", "Accounts")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {users.length} {text("compte", "account")}{users.length !== 1 ? "s" : ""} {text("répertorié", "listed")}
              {users.length !== 1 ? "s" : ""}
            </p>
          </div>
          <input
            type="search"
            aria-label={text("Rechercher un utilisateur", "Search for a user")}
            placeholder={text("Nom ou adresse e-mail", "Name or email address")}
            value={search}
            onChange={event => setSearch(event.target.value)}
            className="admin-input w-full rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 sm:max-w-xs"
          />
        </div>
        {error && (
          <p role="alert" className="m-5 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="admin-table-head">
              <tr>
                {[text("Nom", "Name"), text("E-mail", "Email"), text("Rôle", "Role"), text("Inscription", "Registration"), text("Action", "Action")].map(label => (
                  <th
                    key={label}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-fuchsia-100/70"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {visibleUsers.map(user => {
                const isDemo = DEMO_USERS.some(demo => demo.id === user.id);
                return (
                  <tr key={user.id} className="admin-table-row border-t border-white/[0.05]">
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-white">{user.name}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">{user.email}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                      <span className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2.5 py-1 text-xs text-violet-200">
                        {user.role === "admin" ? text("Administrateur", "Administrator") : text("Utilisateur", "User")}
                        {isDemo ? text(" · démo", " · demo") : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      {!isDemo && user.role === "user" ? (
                        <button
                          type="button"
                          onClick={() => removeUser(user)}
                          className="font-medium text-red-400 hover:text-red-300"
                        >
                          {text("Supprimer", "Delete")}
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                    {text("Aucun utilisateur ne correspond à cette recherche.", "No users match this search.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="admin-note border-t border-white/[0.06] px-5 py-4 text-xs text-violet-100">
          {text("Version prototype : les comptes sont stockés localement dans ce navigateur. La gestion centralisée nécessite un backend.", "Prototype version: accounts are stored locally in this browser. Centralized management requires a backend.")}
        </p>
      </section>
    </AdminSection>
  );
}
