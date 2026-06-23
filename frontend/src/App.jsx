import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SplashPage from "./pages/SplashPage";
import HomePage from "./pages/HomePage";
import ProjectPage from "./pages/ProjectPage";
import SettingsPage from "./pages/SettingsPage";
import MobilePreviewPage from "./pages/MobilePreviewPage";
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
import ManagersAccessRoute from "./components/ManagersAccessRoute";
import Sales from "./pages/Sales";
import SalesTotals from "./pages/SalesTotals";
import SalesAnalytics from "./pages/SalesAnalytics";
import SalesPersonFigures from "./pages/SalesPersonFigures";
import ApproveConcept from "./pages/ApproveConcept";
import ColoursPortal from "./pages/ColoursPortal";
import ThreeDVisPortal from "./pages/ThreeDVisPortal";
import EmailGenerator from "./pages/EmailGenerator";
import SecretArea from "./pages/SecretArea";
import SecretLevelEditor from "./pages/SecretLevelEditor";
import SecretLevel from "./pages/SecretLevel";
import Maps from "./pages/Maps";
import MapsRecent from "./pages/MapsRecent";
import { EmailSendOverlayProvider } from "./components/EmailSendOverlay";
import PortalProjects from "./pages/PortalProjects";
import RequireAuth from "./components/RequireAuth";
import LoggedInUserButton from "./components/LoggedInUserButton";
import PresenceHeartbeat from "./components/PresenceHeartbeat";
import FadeImageOverlay from "./components/FadeImageOverlay";
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
      <PresenceHeartbeat />
      <FadeImageOverlay />
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
            <Route path="/settings/mobile" element={<Auth><AdminAccessRoute><MobilePreviewPage /></AdminAccessRoute></Auth>} />
            <Route path="/apply-fields" element={<Auth><AdminAccessRoute><ApplyFields /></AdminAccessRoute></Auth>} />
            <Route path="/finished-projects" element={<Auth><FinishedProjects /></Auth>} />
            <Route path="/construction-phase" element={<Auth><InConstruction /></Auth>} />
            <Route path="/in-construction" element={<Navigate to="/construction-phase" replace />} />
            <Route path="/site-visit-manager" element={<Auth><SiteVisitManager /></Auth>} />
            <Route path="/site-visit-planner" element={<Auth><SiteVisitPlanner /></Auth>} />
            <Route path="/hotlist" element={<Auth><SalesAccessRoute><Hotlist /></SalesAccessRoute></Auth>} />
            <Route path="/all-projects" element={<Auth><AllProjects /></Auth>} />
            <Route path="/cancelled" element={<Auth><Cancelled /></Auth>} />
            <Route path="/on-hold" element={<Auth><OnHold /></Auth>} />
            <Route path="/managers" element={<Auth><ManagersAccessRoute><Managers /></ManagersAccessRoute></Auth>} />
            <Route path="/managers/site-visit-manager" element={<Auth><ManagersAccessRoute><SiteVisitManager /></ManagersAccessRoute></Auth>} />
            <Route path="/managers/contract-manager" element={<Auth><ManagersAccessRoute><ContractManager /></ManagersAccessRoute></Auth>} />
            <Route path="/managers/colour-manager" element={<Auth><ManagersAccessRoute><ColourManager /></ManagersAccessRoute></Auth>} />
            <Route path="/managers/status-manager" element={<Auth><ManagersAccessRoute><StatusManager /></ManagersAccessRoute></Auth>} />
            <Route path="/managers/drawing-manager" element={<Auth><ManagersAccessRoute><AdminDrawingManagerRoute /></ManagersAccessRoute></Auth>} />
            <Route path="/sales" element={<Auth><SalesAccessRoute><Sales /></SalesAccessRoute></Auth>} />
            <Route path="/sales-totals" element={<Auth><SalesAccessRoute><SalesTotals /></SalesAccessRoute></Auth>} />
            <Route path="/sales-analytics" element={<Auth><SalesAccessRoute><SalesAnalytics /></SalesAccessRoute></Auth>} />
            <Route path="/sales-person-figures" element={<Auth><SalesAccessRoute><SalesPersonFigures /></SalesAccessRoute></Auth>} />
            <Route path="/email-generator" element={<Auth><AdminAccessRoute><EmailGenerator /></AdminAccessRoute></Auth>} />
            <Route path="/secret-area" element={<Auth><SecretArea /></Auth>} />
            <Route path="/secret-area/level-editor" element={<Auth><SecretLevelEditor /></Auth>} />
            <Route path="/secret-area/level" element={<Auth><SecretLevel /></Auth>} />
            <Route path="/maps" element={<Auth><AdminAccessRoute><Maps /></AdminAccessRoute></Auth>} />
            <Route path="/maps/recent" element={<Auth><AdminAccessRoute><MapsRecent /></AdminAccessRoute></Auth>} />
            <Route path="/maps/sold-projects" element={<Auth><AdminAccessRoute><Maps /></AdminAccessRoute></Auth>} />
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
