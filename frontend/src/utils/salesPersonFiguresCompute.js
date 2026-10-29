import { findSalespersonUserInList } from "./streamNewProjectEmail";
import { isExcludedFromProjectLists } from "./projectStatus";

const ILLEGAL_SALE_NAME = "simon marchese";

export function isIllegalSaleName(name) {
  return String(name || "").trim().toLowerCase() === ILLEGAL_SALE_NAME;
}

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
    })),
    totalSales: salesProjects.length,
    totalAccounted,
  };
}
