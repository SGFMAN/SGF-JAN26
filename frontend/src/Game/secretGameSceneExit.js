import { ENTRY_SIDES } from "./secretGameSceneConfig";

const EXIT_PAST_MARGIN = 0.3;

/**
 * Bottom = foreground (+Z), top = back (-Z).
 * @returns {import('./secretGameSceneConfig').EntrySide | null}
 */
export function detectSceneExit(playerX, playerZ, targetX, targetZ, hasTarget, entryPoints, sceneLinks) {
  if (!entryPoints || !sceneLinks) return null;

  const bottom = entryPoints.bottom;
  if (bottom && sceneLinks.bottom) {
    if (playerZ > bottom.z + EXIT_PAST_MARGIN) return "bottom";
    if (hasTarget && targetZ > bottom.z && playerZ >= bottom.z - EXIT_PAST_MARGIN) return "bottom";
  }

  const top = entryPoints.top;
  if (top && sceneLinks.top) {
    if (playerZ < top.z - EXIT_PAST_MARGIN) return "top";
    if (hasTarget && targetZ < top.z && playerZ <= top.z + EXIT_PAST_MARGIN) return "top";
  }

  const left = entryPoints.left;
  if (left && sceneLinks.left) {
    if (playerX < left.x - EXIT_PAST_MARGIN) return "left";
    if (hasTarget && targetX < left.x && playerX <= left.x + EXIT_PAST_MARGIN) return "left";
  }

  const right = entryPoints.right;
  if (right && sceneLinks.right) {
    if (playerX > right.x + EXIT_PAST_MARGIN) return "right";
    if (hasTarget && targetX > right.x && playerX >= right.x - EXIT_PAST_MARGIN) return "right";
  }

  return null;
}

/** Allow click targets past a linked entry edge (outside the walk polygon). */
export function resolveExitClickTarget(rawX, rawZ, entryPoints, sceneLinks) {
  if (!entryPoints || !sceneLinks) return null;

  let best = null;
  let bestPast = 0;

  for (const side of ENTRY_SIDES) {
    const entry = entryPoints[side];
    const link = sceneLinks[side];
    if (!entry || !link) continue;

    let past = 0;
    if (side === "bottom") past = rawZ - entry.z;
    else if (side === "top") past = entry.z - rawZ;
    else if (side === "left") past = entry.x - rawX;
    else if (side === "right") past = rawX - entry.x;

    if (past > 0 && past > bestPast) {
      bestPast = past;
      best = {
        x: rawX,
        z: rawZ,
        exitDirection: side,
      };
    }
  }

  return best;
}
