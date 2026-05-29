/**
 * Position for email signatures and tokens.
 * Uses primary_position_id from Users — not positions[0], which is alphabetical
 * and often picks "Admin" when a user has multiple roles.
 */
export function getUserPrimaryPositionName(user) {
  if (!user?.positions?.length) return "";

  const primaryId = user.primary_position_id;
  if (primaryId != null && primaryId !== "") {
    const match = user.positions.find(
      (p) => p.id === primaryId || Number(p.id) === Number(primaryId)
    );
    if (match?.name) return String(match.name).trim();
  }

  const nonAdmin = user.positions.find((p) => String(p.name || "").trim() !== "Admin");
  return String((nonAdmin || user.positions[0]).name || "").trim();
}
