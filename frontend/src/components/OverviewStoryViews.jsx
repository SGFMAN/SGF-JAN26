import React from "react";
import notepadPaper from "../images/overview/notepad-paper.png";
import redTick from "../images/overview/red-tick.png";
import gardenPath from "../images/overview/garden-path.png";
import corkboard from "../images/overview/corkboard.png";
import goldStar from "../images/overview/gold-star.png";

export const OVERVIEW_GRAPHIC_TABS = [
  { id: "flowchart", label: "Flowchart" },
  { id: "notepad", label: "Notepad" },
  { id: "path", label: "Garden path" },
  { id: "pinboard", label: "Pinboard" },
];

export const OVERVIEW_GRAPHIC_TAB_STORAGE_KEY = "sgf-overview-graphic-tab";

export function loadOverviewGraphicTab() {
  try {
    const saved = localStorage.getItem(OVERVIEW_GRAPHIC_TAB_STORAGE_KEY);
    if (OVERVIEW_GRAPHIC_TABS.some((tab) => tab.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return "flowchart";
}

function statusWord(item) {
  if (item.complete) return "Done";
  if (item.inProgress) return "In progress";
  return "Waiting";
}

function StoryButton({ item, onTileClick, readOnly, className, children }) {
  const interactive = !readOnly && typeof onTileClick === "function" && item.tile;
  return (
    <div
      className={className}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onTileClick(item.tile) : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTileClick(item.tile);
              }
            }
          : undefined
      }
      style={{ cursor: interactive ? "pointer" : "default" }}
    >
      {children}
    </div>
  );
}

function NotepadView({ items, onTileClick, readOnly }) {
  return (
    <div
      className="overview-notepad"
      style={{ backgroundImage: `url(${notepadPaper})` }}
    >
      {items.map((item) => (
        <StoryButton
          key={item.key}
          item={item}
          onTileClick={onTileClick}
          readOnly={readOnly}
          className={`overview-notepad__row overview-notepad__row--${
            item.complete ? "done" : item.inProgress ? "now" : "wait"
          }`}
        >
          <span className="overview-notepad__tick-slot">
            {item.complete ? (
              <img src={redTick} alt="" className="overview-notepad__tick" />
            ) : null}
          </span>
          <span className="overview-notepad__label">{item.label}</span>
          {item.inProgress ? (
            <span className="overview-notepad__now">← in progress</span>
          ) : null}
        </StoryButton>
      ))}
    </div>
  );
}

function PathView({ items, onTileClick, readOnly }) {
  return (
    <div className="overview-path" style={{ backgroundImage: `url(${gardenPath})` }}>
      <div className="overview-path__stones">
        {items.map((item, index) => (
          <StoryButton
            key={item.key}
            item={item}
            onTileClick={onTileClick}
            readOnly={readOnly}
            className={`overview-path__stone overview-path__stone--${
              item.complete ? "done" : item.inProgress ? "now" : "wait"
            }`}
          >
            <span className="overview-path__num">{index + 1}</span>
            <span className="overview-path__label">{item.label}</span>
            <span className="overview-path__status">{statusWord(item)}</span>
          </StoryButton>
        ))}
      </div>
    </div>
  );
}

function PinboardView({ items, onTileClick, readOnly }) {
  return (
    <div className="overview-pinboard" style={{ backgroundImage: `url(${corkboard})` }}>
      {items.map((item) => (
        <StoryButton
          key={item.key}
          item={item}
          onTileClick={onTileClick}
          readOnly={readOnly}
          className={`overview-pin overview-pin--${
            item.complete ? "done" : item.inProgress ? "now" : "wait"
          }`}
        >
          {item.complete ? (
            <img src={goldStar} alt="" className="overview-pin__star" />
          ) : null}
          <span className="overview-pin__label">{item.label}</span>
          <span className="overview-pin__status">{statusWord(item)}</span>
        </StoryButton>
      ))}
    </div>
  );
}

export default function OverviewStoryView({ view, items, onTileClick, readOnly }) {
  if (view === "notepad") {
    return <NotepadView items={items} onTileClick={onTileClick} readOnly={readOnly} />;
  }
  if (view === "path") {
    return <PathView items={items} onTileClick={onTileClick} readOnly={readOnly} />;
  }
  if (view === "pinboard") {
    return <PinboardView items={items} onTileClick={onTileClick} readOnly={readOnly} />;
  }
  return null;
}
