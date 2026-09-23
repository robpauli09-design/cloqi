import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BackendProvider } from "./backend/BackendProvider";
import { WorkspaceProvider } from "./backend/WorkspaceProvider";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BackendProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </BackendProvider>
  </React.StrictMode>,
);
