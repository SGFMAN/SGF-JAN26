import { findSalespersonUserInList } from "./streamNewProjectEmail";
import { isExcludedFromProjectLists } from "./projectStatus";

export function isSalesTeamUser(user) {
  if (!user?.positions || !Array.isArray(user.positions)) return false;
  return user.positions.some(
    (position) => position.name && position.name.toLowerCase() === "sales team"
  );
}

export function filterSalesTeamUsers(users) {
  if (!Array.isArray(users)) return [];
  return users.filter(isSalesTeamUser);
}

/** Same sale scope as Sales Totals: exclude Hotlist/Quote and Home Office / Studio. */
export function filterSalesFigureProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects.filter((project) => {
    if (isExcludedFromProjectLists(project.status)) return false;
    if ((project.classification || "").trim() === "Home Office / Studio") return false;
    return true;
  });
}

/** Street and suburb, matching how project addresses are shown elsewhere. */
export function formatProjectAddress(project) {
  const street = String(project?.street ?? "").trim();
  const suburb = String(project?.suburb ?? "").trim();
  if (street && suburb) return `${street}, ${suburb}`;
  if (street || suburb) return street || suburb;
  const name = String(project?.name ?? "").trim();
  return name || "Unknown address";
}

/**
 * Count sales per sales-team user for a period-filtered project list.
 * Unaccounted = no salesperson, or salesperson not matching a sales-team user.
 */
export function computeSalesPersonFigures(periodProjects, salesTeamUsers) {
  const salesProjects = filterSalesFigureProjects(periodProjects);
  const team = filterSalesTeamUsers(salesTeamUsers);

  const countsByUserId = new Map();
  for (const user of team) {
    countsByUserId.set(user.id, 0);
  }

  let unaccounted = 0;
  const unaccountedProjects = [];

  for (const project of salesProjects) {
    const salesperson = String(project.salesperson ?? "").trim();
    if (!salesperson) {
      unaccounted += 1;
      unaccountedProjects.push(project);
      continue;
    }

    const matched = findSalespersonUserInList(team, salesperson);
    if (matched) {
      countsByUserId.set(matched.id, (countsByUserId.get(matched.id) || 0) + 1);
    } else {
      unaccounted += 1;
      unaccountedProjects.push(project);
    }
  }

  unaccountedProjects.sort((a, b) =>
    formatProjectAddress(a).localeCompare(formatProjectAddress(b), undefined, { sensitivity: "base" })
  );

  const rows = team
    .map((user) => ({
      userId: user.id,
      name: user.name || "Unknown",
      salesCount: countsByUserId.get(user.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const totalAccounted = rows.reduce((sum, row) => sum + row.salesCount, 0);

  return {
    rows,
    unaccounted,
    unaccountedProjects: unaccountedProjects.map((project) => ({
      id: project.id,
      address: formatProjectAddress(project),
      salesperson: String(project.salesperson ?? "").trim(),
    })),
    totalSales: salesProjects.length,
    totalAccounted,
  };
}

/**
 * Rank the sales team for the race board.
 * People with sales are ordered by count. Unaccounted sales sit in that same
 * order when there are any, without taking a place. Zero-sale people stay at the bottom.
 */
export function buildSalesLeaderboard(figures) {
  const withSales = [];
  const withoutSales = [];
  for (const row of figures?.rows || []) {
    if (row.salesCount > 0) withSales.push(row);
    else withoutSales.push(row);
  }

  withSales.sort(
    (a, b) =>
      b.salesCount - a.salesCount ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  withoutSales.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  let rank = 0;
  let lastCount = null;
  const ranked = withSales.map((row) => {
    if (row.salesCount !== lastCount) {
      rank += 1;
      lastCount = row.salesCount;
    }
    return { ...row, rank, kind: "person" };
  });

  const scored = ranked.map((row) => ({ ...row }));
  const unaccounted = Number(figures?.unaccounted) || 0;
  if (unaccounted > 0) {
    scored.push({
      userId: "unaccounted",
      name: "Unaccounted",
      salesCount: unaccounted,
      kind: "unaccounted",
      rank: null,
    });
    scored.sort((a, b) => {
      if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
      if (a.kind === "unaccounted") return 1;
      if (b.kind === "unaccounted") return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  const bars = [
    ...scored,
    ...withoutSales.map((row) => ({ ...row, rank: null, kind: "person" })),
  ];
  const max = bars.reduce((highest, bar) => Math.max(highest, bar.salesCount), 0);
  const leaders = ranked.filter((row) => row.rank === 1);

  return { bars, max, leaders };
}
