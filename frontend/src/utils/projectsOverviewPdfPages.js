/**
 * Pack VIC / QLD list data into PDF page models for portrait A4 print.
 * - QLD always starts on a new page
 * - Within a state, start a new page before a project that would not fit
 * - Pack densely; only reserve TOTAL space on the last page of each state
 */

const CAPTURE_WIDTH_PX = 794;
/** Printable margin on A4 (enough for most printers). */
const MARGIN_MM = 8;

// Match ProjectsOverviewListStatePage compact PDF chrome (see SalesProjectsOverview)
const PAGE_TITLE_AND_PADDING_PX = 58;
const CARD_TOP_PX = 62;
const CARD_BOTTOM_TOTAL_PX = 40;
const STAGE_HEADER_PX = 28;
const STAGE_GAP_PX = 10;
const PROJECT_ROW_PX = 18;
const EMPTY_STAGE_PX = 18;

/** Max card body height (px) for one portrait A4 page at capture width. */
export function getOverviewPdfMaxBodyHeightPx() {
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const usableWidthMm = pageWidthMm - MARGIN_MM * 2;
  const usableHeightMm = pageHeightMm - MARGIN_MM * 2;
  return Math.floor((usableHeightMm / usableWidthMm) * CAPTURE_WIDTH_PX) - PAGE_TITLE_AND_PADDING_PX;
}

function cloneStageShell(stage, projects) {
  return {
    key: stage.key,
    label: stage.label,
    total: stage.total,
    onHold: stage.onHold,
    value: stage.value,
    projects: projects.slice(),
  };
}

function flushPage(pages, draft, stateMeta, { showTotal }) {
  if (!draft.stages.length && !showTotal) return;
  pages.push({
    key: `${stateMeta.stateKey}-${pages.length}`,
    stateKey: stateMeta.stateKey,
    title: stateMeta.title,
    accent: stateMeta.accent,
    continuation: draft.continuation,
    showTotal,
    summary: {
      stages: draft.stages.map((s) => ({ ...s, projects: s.projects.slice() })),
      total: stateMeta.summary.total,
      onHoldTotal: stateMeta.summary.onHoldTotal,
      valueTotal: stateMeta.summary.valueTotal,
    },
  });
}

function packStatePages(pages, stateMeta, maxBodyPx) {
  const { summary } = stateMeta;
  let draft = {
    stages: [],
    continuation: pages.some((p) => p.stateKey === stateMeta.stateKey),
    height: CARD_TOP_PX,
  };

  const startNewPage = () => {
    flushPage(pages, draft, stateMeta, { showTotal: false });
    draft = { stages: [], continuation: true, height: CARD_TOP_PX };
  };

  for (const stage of summary?.stages || []) {
    const projects = stage.projects?.length ? stage.projects : [null];
    let stageOpenOnPage = false;

    for (const project of projects) {
      const headerCost = stageOpenOnPage
        ? 0
        : STAGE_HEADER_PX + (draft.stages.length ? STAGE_GAP_PX : 0);
      const rowCost = project == null ? EMPTY_STAGE_PX : PROJECT_ROW_PX;
      const addCost = headerCost + rowCost;

      // Mid-pages: fill to the bottom. Do not reserve TOTAL space here.
      if (draft.stages.length > 0 && draft.height + addCost > maxBodyPx) {
        startNewPage();
        stageOpenOnPage = false;
      }

      const headerCost2 = stageOpenOnPage
        ? 0
        : STAGE_HEADER_PX + (draft.stages.length ? STAGE_GAP_PX : 0);
      const addCost2 = headerCost2 + rowCost;

      if (!stageOpenOnPage) {
        draft.stages.push(cloneStageShell(stage, project == null ? [] : [project]));
        draft.height += addCost2;
        stageOpenOnPage = true;
      } else if (project != null) {
        draft.stages[draft.stages.length - 1].projects.push(project);
        draft.height += PROJECT_ROW_PX;
      } else {
        draft.height += EMPTY_STAGE_PX;
      }
    }
  }

  // Last page of this state needs room for TOTAL
  if (draft.height + CARD_BOTTOM_TOTAL_PX > maxBodyPx && draft.stages.length > 0) {
    startNewPage();
  }
  flushPage(pages, draft, stateMeta, { showTotal: true });
}

/**
 * @returns {Array<{ key, stateKey, title, accent, continuation, showTotal, summary }>}
 */
export function buildProjectsOverviewListPdfPages(overview) {
  const maxBodyPx = getOverviewPdfMaxBodyHeightPx();
  const pages = [];

  packStatePages(
    pages,
    {
      stateKey: "VIC",
      title: "VIC",
      accent: null,
      summary: overview?.VIC,
    },
    maxBodyPx
  );

  packStatePages(
    pages,
    {
      stateKey: "QLD",
      title: "QLD",
      accent: null,
      summary: overview?.QLD,
    },
    maxBodyPx
  );

  return pages;
}

export { CAPTURE_WIDTH_PX, MARGIN_MM };
