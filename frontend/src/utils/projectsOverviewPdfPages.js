/**
 * Pack VIC / QLD list data into PDF page models.
 * - QLD always starts on a new page
 * - Within a state, start a new page before a project that would not fit
 */

const CAPTURE_WIDTH_PX = 794;
const MARGIN_MM = 12;
const PAGE_TITLE_AND_PADDING_PX = 100;
const CARD_TOP_PX = 100; // padding + state title
const CARD_BOTTOM_TOTAL_PX = 56;
const STAGE_HEADER_PX = 40;
const STAGE_GAP_PX = 16;
const PROJECT_ROW_PX = 24;
const EMPTY_STAGE_PX = 24;

/** Max content height (px) for one portrait A4 page at capture width, excluding outer page title. */
export function getOverviewPdfMaxBodyHeightPx() {
  // A4 portrait: 210 x 297 mm
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const usableWidthMm = pageWidthMm - MARGIN_MM * 2;
  const usableHeightMm = pageHeightMm - MARGIN_MM * 2;
  return Math.floor((usableHeightMm / usableWidthMm) * CAPTURE_WIDTH_PX * 0.92) - PAGE_TITLE_AND_PADDING_PX;
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
  let draft = { stages: [], continuation: pages.some((p) => p.stateKey === stateMeta.stateKey), height: CARD_TOP_PX };
  // First page of this state always starts fresh (caller ensures QLD is new page)
  draft.continuation = pages.some((p) => p.stateKey === stateMeta.stateKey);

  const startNewPage = () => {
    flushPage(pages, draft, stateMeta, { showTotal: false });
    draft = { stages: [], continuation: true, height: CARD_TOP_PX };
  };

  for (const stage of summary?.stages || []) {
    const projects = stage.projects?.length ? stage.projects : [null]; // null = empty placeholder
    let stageOpenOnPage = false;

    for (const project of projects) {
      const headerCost = stageOpenOnPage ? 0 : STAGE_HEADER_PX + (draft.stages.length ? STAGE_GAP_PX : 0);
      const rowCost = project == null ? EMPTY_STAGE_PX : PROJECT_ROW_PX;
      const addCost = headerCost + rowCost;

      if (draft.stages.length > 0 && draft.height + addCost + CARD_BOTTOM_TOTAL_PX > maxBodyPx) {
        startNewPage();
        stageOpenOnPage = false;
      }

      // After new page, recompute header cost
      const headerCost2 = stageOpenOnPage ? 0 : STAGE_HEADER_PX + (draft.stages.length ? STAGE_GAP_PX : 0);
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

  // Ensure TOTAL fits on last page of this state
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
      accent: null, // filled by caller / component uses STREAM
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
