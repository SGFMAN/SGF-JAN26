import { BrowserRouter, Routes, Route } from "react-router-dom";
import SplashPage from "./pages/SplashPage";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";
import SettingsPage from "./pages/SettingsPage";
import ApplyFields from "./pages/ApplyFields";
import FinishedProjects from "./pages/FinishedProjects";
import SiteVisitManager from "./pages/SiteVisitManager";
import SiteVisitPlanner from "./pages/SiteVisitPlanner";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/projects" element={<HomePage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/apply-fields" element={<ApplyFields />} />
        <Route path="/finished-projects" element={<FinishedProjects />} />
        <Route path="/site-visit-manager" element={<SiteVisitManager />} />
        <Route path="/site-visit-planner" element={<SiteVisitPlanner />} />
      </Routes>
    </BrowserRouter>
  );
}
