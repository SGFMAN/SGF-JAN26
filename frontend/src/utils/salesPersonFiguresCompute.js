import { findSalespersonUserInList } from "./streamNewProjectEmail";

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

/** Same sale scope as Sales Totals: exclude Hotlist and Home Office / Studio. */
export function filterSalesFigureProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects.filter((project) => {
    if (project.status === "Hotlist") return false;
    if ((project.classification || "").trim() === "Home Office / Studio") return false;
    return true;
  });
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

  for (const project of salesProjects) {
    const salesperson = String(project.salesperson ?? "").trim();
    if (!salesperson) {
      unaccounted += 1;
      continue;
    }

    const matched = findSalespersonUserInList(team, salesperson);
    if (matched) {
      countsByUserId.set(matched.id, (countsByUserId.get(matched.id) || 0) + 1);
    } else {
      unaccounted += 1;
    }
  }

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
    totalSales: salesProjects.length,
    totalAccounted,
  };
}
