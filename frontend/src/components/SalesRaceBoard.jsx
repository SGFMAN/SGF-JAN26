import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { getLoggedInUserId } from "../utils/auth";
import { buildSalesLeaderboard } from "../utils/salesPersonFiguresCompute";
import "../pages/salesLeaderboard.css";

function placeLabel(rank) {
  if (!rank) return "";
  const teen = rank % 100;
  if (teen >= 11 && teen <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

function unclaimedNote(unaccounted, leaders) {
  if (!unaccounted) return "";
  if (!leaders.length) return "Those unclaimed sales are still up for grabs.";
  if (unaccounted > leaders[0].salesCount) return "Unclaimed sales are ahead of the field.";
  if (unaccounted === leaders[0].salesCount) return "Unclaimed sales are level with the lead.";
  return "";
}

function medalClass(rank, salesCount) {
  if (!salesCount || !rank) return "";
  if (rank === 1) return "is-gold";
  if (rank === 2) return "is-silver";
  if (rank === 3) return "is-bronze";
  return "";
}

function leaderLine(leaders, bars) {
  if (!leaders.length) return "No claimed sales in this period yet.";
  const score = leaders[0].salesCount;
  const chaser = bars.find((bar) => bar.kind === "person" && bar.salesCount > 0 && bar.salesCount < score);
  const gap = chaser ? score - chaser.salesCount : null;
  const names = leaders.map((leader) => leader.name);
  if (names.length === 1) {
    return { name: names[0], rest: gap ? ` is leading by ${gap}` : " is out in front" };
  }
  if (names.length === 2) {
    return { name: `${names[0]} and ${names[1]}`, rest: ` are tied on ${score}` };
  }
  return {
    name: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`,
    rest: ` are tied on ${score}`,
  };
}

export default function SalesRaceBoard({ periodLabel, figures, claimTo, youId }) {
  const board = useMemo(() => buildSalesLeaderboard(figures), [figures]);
  const loggedInId = youId ?? getLoggedInUserId();
  const headline = leaderLine(board.leaders, board.bars);
  const aside = unclaimedNote(figures.unaccounted, board.leaders);
  const claimHot = figures.unaccounted > 0;
  const max = board.max || 1;

  return (
    <section className="sgf-race" aria-label="Sales race">
      <div className="sgf-race-top">
        <div>
          <p className="sgf-race-kicker">The race</p>
          <h2 className="sgf-race-period">{periodLabel}</h2>
          <p className="sgf-race-lead">
            {typeof headline === "string" ? (
              headline
            ) : (
              <>
                <strong>{headline.name}</strong>
                {headline.rest}
              </>
            )}
          </p>
          {aside && <p className="sgf-race-aside">{aside}</p>}
        </div>
        <Link className={claimHot ? "sgf-race-claim is-hot" : "sgf-race-claim"} to={claimTo}>
          Claim Unaccounted for Sales
          {claimHot && <span className="sgf-race-claim-count">{figures.unaccounted}</span>}
        </Link>
      </div>

      <ol className="sgf-race-list">
        {board.bars.map((bar, index) => {
          const unclaimed = bar.kind === "unaccounted";
          const isYou = !unclaimed && loggedInId && String(bar.userId) === String(loggedInId);
          const width = bar.salesCount > 0 ? Math.max((bar.salesCount / max) * 100, 4) : 0;
          const classes = [
            "sgf-race-row",
            medalClass(bar.rank, bar.salesCount),
            bar.rank === 1 ? "is-lead" : "",
            unclaimed ? "is-unclaimed" : "",
            isYou ? "is-you" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li
              key={unclaimed ? "unaccounted" : bar.userId}
              className={classes}
            >
              <span className="sgf-race-place">{unclaimed ? "—" : placeLabel(bar.rank) || "—"}</span>
              <span className="sgf-race-who">
                <span className="sgf-race-name" title={bar.name}>
                  {bar.name}
                </span>
                {isYou && <span className="sgf-race-you-tag">You</span>}
              </span>
              <span className="sgf-race-track" aria-hidden="true">
                <span className="sgf-race-fill" style={{ "--bar": `${width}%`, animationDelay: `${index * 45}ms` }} />
              </span>
              <span className="sgf-race-count">{bar.salesCount}</span>
            </li>
          );
        })}
      </ol>

      <div className="sgf-race-foot">
        <span>{figures.totalSales} sales in this period</span>
        <span>{figures.unaccounted > 0 ? `${figures.unaccounted} unclaimed` : "Every sale is claimed"}</span>
      </div>
    </section>
  );
}
