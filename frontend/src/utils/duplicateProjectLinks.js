/** Pair renovation/source linked projects (same chain as main project grid). */
export function buildDuplicateChainGroups(items) {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const used = new Set();
  const groups = [];
  for (const p of list) {
    if (used.has(p.id)) continue;
    const raw = p.duplicate_source_project_id;
    if (raw != null && String(raw).trim() !== "") {
      const srcId = Number(raw);
      const src = Number.isFinite(srcId) ? byId.get(srcId) : null;
      if (src && !used.has(src.id)) {
        groups.push({ type: "pair", a: src, b: p });
        used.add(src.id);
        used.add(p.id);
        continue;
      }
    }
    const copy = list.find(
      (c) => !used.has(c.id) && Number(c.duplicate_source_project_id) === p.id
    );
    if (copy) {
      groups.push({ type: "pair", a: p, b: copy });
      used.add(p.id);
      used.add(copy.id);
      continue;
    }
    groups.push({ type: "single", project: p });
    used.add(p.id);
  }
  return groups;
}

/**
 * One row per linked chain for Planning Manager.
 * Source project is the row identity; partner is attached for combined labels.
 */
export function collapseLinkedProjectsForPlanning(items) {
  return buildDuplicateChainGroups(items).map((g) => {
    if (g.type === "single") return g.project;
    return { ...g.a, _planningLinkPartner: g.b };
  });
}
