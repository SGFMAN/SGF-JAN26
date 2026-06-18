import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import AdminDrawingManagerRoute from "./components/AdminDrawingManagerRoute";
import AdminAccessRoute from "./components/AdminAccessRoute";
import SalesAccessRoute from "./components/SalesAccessRoute";
import QpManager from "./pages/QpManager";
import ProjectClaim from "./pages/ProjectClaim";
import Sales from "./pages/Sales";
import SalesTotals from "./pages/SalesTotals";
import SalesAnalytics from "./pages/SalesAnalytics";
import ApproveConcept from "./pages/ApproveConcept";
import ColoursPortal from "./pages/ColoursPortal";
import ThreeDVisPortal from "./pages/ThreeDVisPortal";
import EmailGenerator from "./pages/EmailGenerator";
import SecretArea from "./pages/SecretArea";
import SecretLevelEditor from "./pages/SecretLevelEditor";
import SecretLevel from "./pages/SecretLevel";
import Maps from "./pages/Maps";
import MapsRecent from "./pages/MapsRecent";
import TimeSheet from "./pages/TimeSheet";
import AppModeBanner from "./components/AppModeBanner";
import { EmailSendOverlayProvider } from "./components/EmailSendOverlay";
import PortalProjects from "./pages/PortalProjects";
import RequireAuth from "./components/RequireAuth";
import LoggedInUserButton from "./components/LoggedInUserButton";
import { UiThemeProvider } from "./context/UiThemeProvider";

function Auth({ children }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  const isCloudflarePublicHost =
    typeof window !== "undefined" &&
    typeof window.location?.hostname === "string" &&
    window.location.hostname.toLowerCase().endsWith("trycloudflare.com");

  return (
    <BrowserRouter>
      <UiThemeProvider>
      <EmailSendOverlayProvider>
      {!isCloudflarePublicHost && <AppModeBanner />}
      <LoggedInUserButton />
      <Routes>
        {isCloudflarePublicHost ? (
          <>
            <Route path="/" element={<SplashPage />} />
            <Route path="/portal" element={<Auth><PortalProjects /></Auth>} />
            <Route path="/portal/projects/:token" element={<Auth><ProjectPage /></Auth>} />
            <Route path="/approve-concept/:projectId" element={<ApproveConcept />} />
            <Route path="/colours-portal/:projectId" element={<ColoursPortal />} />
            <Route path="/3d-vis-portal/:projectId" element={<ThreeDVisPortal />} />
            <Route path="/secret-area" element={<Auth><SecretArea /></Auth>} />
            <Route path="/secret-area/level-editor" element={<Auth><SecretLevelEditor /></Auth>} />
            <Route path="/secret-area/level" element={<Auth><SecretLevel /></Auth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<SplashPage />} />
            <Route path="/projects" element={<Auth><HomePage /></Auth>} />
            <Route path="/variations" element={<Navigate to="/projects" replace />} />
            <Route path="/project/:token" element={<Auth><ProjectPage /></Auth>} />
            <Route path="/settings" element={<Auth><AdminAccessRoute><SettingsPage /></AdminAccessRoute></Auth>} />
            <Route path="/apply-fields" element={<Auth><AdminAccessRoute><ApplyFields /></AdminAccessRoute></Auth>} />
            <Route path="/finished-projects" element={<Auth><FinishedProjects /></Auth>} />
            <Route path="/construction-phase" element={<Auth><InConstruction /></Auth>} />
            <Route path="/in-construction" element={<Navigate to="/construction-phase" replace />} />
            <Route path="/site-visit-manager" element={<Auth><SiteVisitManager /></Auth>} />
            <Route path="/site-visit-planner" element={<Auth><SiteVisitPlanner /></Auth>} />
            <Route path="/hotlist" element={<Auth><Hotlist /></Auth>} />
            <Route path="/all-projects" element={<Auth><AllProjects /></Auth>} />
            <Route path="/cancelled" element={<Auth><Cancelled /></Auth>} />
            <Route path="/on-hold" element={<Auth><OnHold /></Auth>} />
            <Route path="/managers" element={<Auth><Managers /></Auth>} />
            <Route path="/managers/site-visit-manager" element={<Auth><SiteVisitManager /></Auth>} />
            <Route path="/managers/contract-manager" element={<Auth><ContractManager /></Auth>} />
            <Route path="/managers/colour-manager" element={<Auth><ColourManager /></Auth>} />
            <Route path="/managers/status-manager" element={<Auth><StatusManager /></Auth>} />
            <Route path="/managers/drawing-manager" element={<Auth><AdminDrawingManagerRoute /></Auth>} />
            <Route path="/managers/qp-manager" element={<Auth><QpManager /></Auth>} />
            <Route path="/managers/project-claim" element={<Auth><ProjectClaim /></Auth>} />
            <Route path="/sales" element={<Auth><SalesAccessRoute><Sales /></SalesAccessRoute></Auth>} />
            <Route path="/sales-totals" element={<Auth><SalesAccessRoute><SalesTotals /></SalesAccessRoute></Auth>} />
            <Route path="/sales-analytics" element={<Auth><SalesAccessRoute><SalesAnalytics /></SalesAccessRoute></Auth>} />
            <Route path="/email-generator" element={<Auth><AdminAccessRoute><EmailGenerator /></AdminAccessRoute></Auth>} />
            <Route path="/secret-area" element={<Auth><SecretArea /></Auth>} />
            <Route path="/secret-area/level-editor" element={<Auth><SecretLevelEditor /></Auth>} />
            <Route path="/secret-area/level" element={<Auth><SecretLevel /></Auth>} />
            <Route path="/maps" element={<Auth><AdminAccessRoute><Maps /></AdminAccessRoute></Auth>} />
            <Route path="/maps/recent" element={<Auth><AdminAccessRoute><MapsRecent /></AdminAccessRoute></Auth>} />
            <Route path="/maps/sold-projects" element={<Auth><AdminAccessRoute><Maps /></AdminAccessRoute></Auth>} />
            <Route path="/time-sheet" element={<Auth><TimeSheet /></Auth>} />
            <Route path="/benbox" element={<Navigate to="/maps" replace />} />
            <Route path="/faq" element={<Navigate to="/maps" replace />} />
            <Route path="/approve-concept/:projectId" element={<ApproveConcept />} />
            <Route path="/colours-portal/:projectId" element={<ColoursPortal />} />
            <Route path="/3d-vis-portal/:projectId" element={<ThreeDVisPortal />} />
            <Route path="/portal" element={<Auth><PortalProjects /></Auth>} />
            <Route path="/portal/projects/:token" element={<Auth><ProjectPage /></Auth>} />
          </>
        )}
      </Routes>
      </EmailSendOverlayProvider>
      </UiThemeProvider>
    </BrowserRouter>
  );
}
