export function getSafeReturnPath(search: string): string | null {
  const value = new URLSearchParams(search).get("next");
  return value === "/basket" ? value : null;
}
