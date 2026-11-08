import { migrateLegacyStorage } from "./legacyStorage";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BackendProvider } from "./backend/BackendProvider";
import { WorkspaceProvider } from "./backend/WorkspaceProvider";
import { AuthProvider, AuthGate } from "./auth/AuthProvider";
import "./styles.css";
import "./roles/roles.css";
migrateLegacyStorage();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider><BackendProvider><AuthGate>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </AuthGate></BackendProvider></AuthProvider>
  </React.StrictMode>,
);
