import { BrowserRouter, Routes, Route } from "react-router-dom";
import SplashPage from "./pages/SplashPage";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";
import SettingsPage from "./pages/SettingsPage";
import ApplyFields from "./pages/ApplyFields";
import FinishedProjects from "./pages/FinishedProjects";
import InConstruction from "./pages/InConstruction";
import SiteVisitManager from "./pages/SiteVisitManager";
import SiteVisitPlanner from "./pages/SiteVisitPlanner";
import Hotlist from "./pages/Hotlist";
import AllProjects from "./pages/AllProjects";
import Cancelled from "./pages/Cancelled";
import OnHold from "./pages/OnHold";
import Managers from "./pages/Managers";
import ContractManager from "./pages/ContractManager";
import ColourManager from "./pages/ColourManager";
import StatusManager from "./pages/StatusManager";
import Sales from "./pages/Sales";
import SalesTotals from "./pages/SalesTotals";
import SalesAnalytics from "./pages/SalesAnalytics";
import AppModeBanner from "./components/AppModeBanner";

export default function App() {
  return (
    <BrowserRouter>
      <AppModeBanner />
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/projects" element={<HomePage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/apply-fields" element={<ApplyFields />} />
        <Route path="/finished-projects" element={<FinishedProjects />} />
        <Route path="/in-construction" element={<InConstruction />} />
        <Route path="/site-visit-manager" element={<SiteVisitManager />} />
        <Route path="/site-visit-planner" element={<SiteVisitPlanner />} />
        <Route path="/hotlist" element={<Hotlist />} />
        <Route path="/all-projects" element={<AllProjects />} />
        <Route path="/cancelled" element={<Cancelled />} />
        <Route path="/on-hold" element={<OnHold />} />
        <Route path="/managers" element={<Managers />} />
        <Route path="/managers/site-visit-manager" element={<SiteVisitManager />} />
        <Route path="/managers/contract-manager" element={<ContractManager />} />
        <Route path="/managers/colour-manager" element={<ColourManager />} />
        <Route path="/managers/status-manager" element={<StatusManager />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales-totals" element={<SalesTotals />} />
        <Route path="/sales-analytics" element={<SalesAnalytics />} />
      </Routes>
    </BrowserRouter>
  );
}
