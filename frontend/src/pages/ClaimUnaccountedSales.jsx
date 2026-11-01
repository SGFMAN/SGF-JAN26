import React from "react";
import { Link } from "react-router-dom";
import SalesFiguresPage from "../components/SalesFiguresPage";
import { useSalesPersonFiguresData } from "../hooks/useSalesPersonFiguresData";
import "./salesLeaderboard.css";

export default function ClaimUnaccountedSales() {
  const data = useSalesPersonFiguresData();
  const count = data.figures.unaccounted;
  const boardTo = `/sales-person-figures?${data.periodQuery}`;

  return (
    <SalesFiguresPage
      title="Claim Unaccounted Sales"
      backTo={boardTo}
      backLabel="← Back to the Race"
      selectedYear={data.selectedYear}
      onYearChange={data.setSelectedYear}
      yearView={data.yearView}
      onYearViewToggle={data.handleYearViewToggle}
      yearViewToggleLabel={data.yearViewToggleLabel}
      availablePeriods={data.availablePeriods}
    >
      {data.loading && <p style={{ margin: 0 }}>Loading…</p>}
      {data.error && <p style={{ margin: 0, color: "#cc3333" }}>Error: {data.error}</p>}
      {!data.loading && !data.error && (
        <div className="sgf-claim">
          <div className="sgf-claim-head">
            <h2>{data.periodLabel}</h2>
            <p>
              {count === 0
                ? "Every project in this period is assigned to a sales person."
                : `${count} ${count === 1 ? "sale has" : "sales have"} no sales person. Scroll the list and claim one.`}
            </p>
          </div>
          {data.assignError && <p className="sgf-claim-error">{data.assignError}</p>}
          <div className="sgf-claim-list">
            {count === 0 ? (
              <p className="sgf-claim-empty">
                Nothing left to claim. <Link to={boardTo}>Back to the race</Link>
              </p>
            ) : (
              data.figures.unaccountedProjects.map((project) => (
                <div className="sgf-claim-row" key={project.id}>
                  <div className="sgf-claim-address">
                    <div className="sgf-claim-street" title={project.address}>
                      {project.address}
                    </div>
                    {project.salesperson ? (
                      <span className="sgf-claim-was">Listed as {project.salesperson}, not on the sales team</span>
                    ) : null}
                  </div>
                  <select
                    aria-label={`Claim ${project.address}`}
                    value=""
                    disabled={data.savingProjectId === project.id || data.salespersonOptions.length === 0}
                    onChange={(e) => data.handleAssignSalesperson(project.id, e.target.value)}
                  >
                    <option value="">
                      {data.savingProjectId === project.id
                        ? "Saving…"
                        : data.salespersonOptions.length === 0
                          ? "No sales team"
                          : "Claim for…"}
                    </option>
                    {data.salespersonOptions.map((user) => (
                      <option key={user.id} value={user.name}>
                        {user.name} · {user.salesCount}
                      </option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </SalesFiguresPage>
  );
}
