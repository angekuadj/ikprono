type ExportMatchStatus = "won" | "lost" | "pending" | "unavailable";

export function exportCombinationPdf(
  title: string,
  content: string,
  language: "fr" | "en" = "fr",
  matchStatuses: Record<string, ExportMatchStatus> = {},
  pickStatuses: Record<string, ExportMatchStatus> = {}
): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("The PDF export window was blocked.");
  }

  printWindow.opener = null;
  const { document } = printWindow;
  document.title = title;

  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #172033; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f5; font-size: 13px; line-height: 1.5; }
    .sheet { width: min(100%, 820px); min-height: 100vh; margin: 28px auto; padding: 34px; background: #fff; box-shadow: 0 12px 40px #1322381a; }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 22px; border-bottom: 1px solid #e3e9ed; }
    .brand-name { display: flex; align-items: center; gap: 11px; color: #123c32; font-size: 16px; font-weight: 800; letter-spacing: .03em; }
    .brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: #0f7658; color: #fff; font-size: 18px; }
    .brand-caption { color: #718096; font-size: 10px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; }
    .hero { margin: 24px 0 18px; padding: 22px 24px; border-radius: 16px; background: linear-gradient(125deg, #102e2a, #174e40); color: #fff; }
    .eyebrow { margin: 0 0 7px; color: #9ce6c4; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 25px; line-height: 1.2; letter-spacing: -.025em; }
    .description { margin: 9px 0 0; color: #d5e5df; font-size: 12px; }
    .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 14px 0 22px; }
    .summary-item { padding: 6px 10px; border: 1px solid #dce5e8; border-radius: 999px; color: #475569; font-size: 11px; }
    .estimate { border-color: #a9dfc7; background: #eaf8f0; color: #126344; font-weight: 700; }
    .section-title { margin: 0 0 11px; color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    .matches { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .match { break-inside: avoid; padding: 15px; border: 1px solid #e1e8eb; border-radius: 12px; background: #fff; }
    .match-heading { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
    .match-number { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; border-radius: 8px; background: #e9f5ef; color: #16704f; font-size: 11px; font-weight: 800; }
    .teams { margin: 1px 0 0; color: #172033; font-size: 13px; font-weight: 700; line-height: 1.4; }
    .match-status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; margin: 0 0 9px; padding: 3px 8px; border: 1px solid; border-radius: 999px; font-size: 10px; font-weight: 700; }
    .status-won { border-color: #a9dfc7; background: #eaf8f0; color: #126344; }
    .status-lost { border-color: #f2b8b5; background: #fff0ef; color: #a32d29; }
    .status-pending { border-color: #f2d28e; background: #fff8e8; color: #90621a; }
    .status-unavailable { border-color: #d6dde3; background: #f1f4f6; color: #5d6876; }
    .picks { display: flex; flex-direction: column; gap: 6px; }
    .pick-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .pick { padding: 5px 8px; border-radius: 6px; background: #f1f6f4; color: #315348; font-size: 10px; }
    .pick-status { flex: 0 0 auto; padding: 3px 7px; border: 1px solid; border-radius: 999px; font-size: 9px; font-weight: 700; }
    .empty-pick { color: #718096; font-size: 11px; }
    .footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 24px; padding-top: 13px; border-top: 1px solid #e3e9ed; color: #7b8794; font-size: 10px; }
    @media (max-width: 600px) { .sheet { margin: 0; padding: 22px; } .matches { grid-template-columns: 1fr; } h1 { font-size: 21px; } }
    @page { size: A4; margin: 0; }
    @media print {
      body { background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .sheet { width: 100%; min-height: auto; margin: 0; padding: 14mm; box-shadow: none; }
      .hero, .match, .summary-item, .pick { break-inside: avoid; }
      .matches { grid-template-columns: 1fr 1fr; }
    }
  `;
  document.head.append(style);

  const lines = content.split(/\r?\n/).map(line => line.trimEnd());
  if (lines[0]?.trim() === title.trim()) lines.shift();
  const matches: { teams: string; picks: string[]; status: ExportMatchStatus }[] = [];
  const details: string[] = [];
  let currentMatch: { teams: string; picks: string[]; status: ExportMatchStatus } | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ")) {
      if (currentMatch) currentMatch.picks.push(line.slice(2));
      else details.push(line);
      continue;
    }
    if (line.includes(" — ")) {
      currentMatch = { teams: line, picks: [], status: matchStatuses[line] ?? "pending" };
      matches.push(currentMatch);
      continue;
    }
    currentMatch = undefined;
    details.push(line);
  }

  const sheet = document.createElement("main");
  sheet.className = "sheet";
  const brand = document.createElement("header");
  brand.className = "brand";
  const brandName = document.createElement("div");
  brandName.className = "brand-name";
  const brandMark = document.createElement("span");
  brandMark.className = "brand-mark";
  brandMark.textContent = "I";
  const brandText = document.createElement("span");
  brandText.textContent = "IkProno";
  brandName.append(brandMark, brandText);
  const brandCaption = document.createElement("span");
  brandCaption.className = "brand-caption";
  brandCaption.textContent = language === "fr" ? "Votre combinaison" : "Your combination";
  brand.append(brandName, brandCaption);

  const hero = document.createElement("section");
  hero.className = "hero";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = language === "fr" ? "COMBINAISON SPORTIVE" : "SPORTS COMBINATION";
  const heading = document.createElement("h1");
  heading.textContent = title;
  hero.append(eyebrow, heading);

  const summary = document.createElement("section");
  summary.className = "summary";
  const description = details.find(line => !/^(date d’enregistrement|saved on|estimation|indicative estimate)/i.test(line));
  if (description) {
    const descriptionElement = document.createElement("p");
    descriptionElement.className = "description";
    descriptionElement.textContent = description;
    hero.append(descriptionElement);
  }
  if (matches.length > 0) {
    const count = document.createElement("span");
    count.className = "summary-item";
    count.textContent = language === "fr"
      ? `${matches.length} rencontre${matches.length > 1 ? "s" : ""}`
      : `${matches.length} fixture${matches.length > 1 ? "s" : ""}`;
    summary.append(count);
  }
  for (const detail of details) {
    if (detail === description) continue;
    const item = document.createElement("span");
    item.className = `summary-item${/estimation|estimate/i.test(detail) ? " estimate" : ""}`;
    item.textContent = detail;
    summary.append(item);
  }

  const sectionTitle = document.createElement("h2");
  sectionTitle.className = "section-title";
  sectionTitle.textContent = language === "fr" ? "Détail des rencontres · statut" : "Fixture details · status";
  const matchList = document.createElement("section");
  matchList.className = "matches";
  for (const [index, match] of matches.entries()) {
    const card = document.createElement("article");
    card.className = "match";
    const statusLabels: Record<ExportMatchStatus, { icon: string; label: string }> = language === "fr"
      ? {
        won: { icon: "✓", label: "Gagnée" },
        lost: { icon: "×", label: "Perdue" },
        pending: { icon: "◷", label: "En attente" },
        unavailable: { icon: "?", label: "Indisponible" },
      }
      : {
        won: { icon: "✓", label: "Won" },
        lost: { icon: "×", label: "Lost" },
        pending: { icon: "◷", label: "Pending" },
        unavailable: { icon: "?", label: "Unavailable" },
      };
    const status = document.createElement("p");
    status.className = `match-status status-${match.status}`;
    status.textContent = `${statusLabels[match.status].icon} ${statusLabels[match.status].label}`;
    const matchHeading = document.createElement("div");
    matchHeading.className = "match-heading";
    const number = document.createElement("span");
    number.className = "match-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const teams = document.createElement("h3");
    teams.className = "teams";
    teams.textContent = match.teams;
    matchHeading.append(number, teams);
    const picks = document.createElement("div");
    picks.className = "picks";
    for (const pick of match.picks) {
      const row = document.createElement("div");
      row.className = "pick-row";
      const pickLabel = document.createElement("span");
      pickLabel.className = "pick";
      pickLabel.textContent = pick;
      const pickStatus = document.createElement("span");
      const outcome = pickStatuses[`${match.teams}::${pick}`] ?? "pending";
      pickStatus.className = `pick-status status-${outcome}`;
      pickStatus.textContent = `${statusLabels[outcome].icon} ${statusLabels[outcome].label}`;
      row.append(pickLabel, pickStatus);
      picks.append(row);
    }
    if (match.picks.length === 0) {
      const empty = document.createElement("span");
      empty.className = "empty-pick";
      empty.textContent = language === "fr" ? "Aucun choix renseigné" : "No picks provided";
      picks.append(empty);
    }
    card.append(status, matchHeading, picks);
    matchList.append(card);
  }

  const footer = document.createElement("footer");
  footer.className = "footer";
  const footerBrand = document.createElement("span");
  footerBrand.textContent = language === "fr" ? "Généré avec IkProno" : "Generated with IkProno";
  const footerNote = document.createElement("span");
  footerNote.textContent = language === "fr"
    ? "Estimation indicative, sans garantie de résultat."
    : "Indicative estimate; outcomes are not guaranteed.";
  footer.append(footerBrand, footerNote);
  sheet.append(brand, hero, summary, sectionTitle, matchList, footer);
  document.body.replaceChildren(sheet);

  printWindow.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}
