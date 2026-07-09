import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, BuildPlanPage } from "./App";
import { AccountPage, VerifiedPage } from "./account";
import { HelpArticlePage, HelpIndexPage } from "./help";
import { PrivacyPage, TermsPage } from "./legal";
import "./styles/marketing.css";

// Tiny path-based router (the _redirects SPA fallback serves index.html for all paths).
function Root() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/account") return <AccountPage />;
  if (path === "/verified") return <VerifiedPage />;
  if (path === "/build") return <BuildPlanPage />;
  if (path === "/help") return <HelpIndexPage />;
  if (path.startsWith("/help/")) return <HelpArticlePage slug={path.slice("/help/".length)} />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/privacy") return <PrivacyPage />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
// cache-bust: rotate bundle hash after edge poisoning (2026-07-08)
