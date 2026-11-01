import React from "react";
import SalesFiguresPage from "../components/SalesFiguresPage";
import SalesRaceBoard from "../components/SalesRaceBoard";
import { useSalesPersonFiguresData } from "../hooks/useSalesPersonFiguresData";
import { UI } from "../utils/uiThemeTokens.js";

export default function SalesPersonFigures() {
  const data = useSalesPersonFiguresData();
  const showBoard = data.figures.rows.length > 0 || data.figures.unaccounted > 0;

  return (
    <SalesFiguresPage
      title="Sales Person Figures"
      backTo="/sales-totals"
      backLabel="← Back to Totals"
      selectedYear={data.selectedYear}
      onYearChange={data.setSelectedYear}
      yearView={data.yearView}
      onYearViewToggle={data.handleYearViewToggle}
      yearViewToggleLabel={data.yearViewToggleLabel}
      availablePeriods={data.availablePeriods}
    >
      {data.loading && <p style={{ margin: 0 }}>Loading…</p>}
      {data.error && <p style={{ margin: 0, color: "#cc3333" }}>Error: {data.error}</p>}
      {!data.loading && !data.error && showBoard && (
        <SalesRaceBoard
          periodLabel={data.periodLabel}
          figures={data.figures}
          claimTo={`/sales-person-figures/claim?${data.periodQuery}`}
        />
      )}
      {!data.loading && !data.error && !showBoard && (
        <p style={{ margin: 0, color: UI.textPrimary }}>
          No users with the Sales Team position were found.
        </p>
      )}
    </SalesFiguresPage>
  );
}
