import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AccountPage, VerifiedPage } from "./account";
import "./styles/marketing.css";

// Tiny path-based router (the _redirects SPA fallback serves index.html for all paths).
function Root() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/account") return <AccountPage />;
  if (path === "/verified") return <VerifiedPage />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
