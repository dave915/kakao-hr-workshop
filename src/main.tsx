import React from "react";
import ReactDOM from "react-dom/client";
// The original expedition illustration still uses Jua for its painted label.
import "@fontsource/jua/400.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import App, { ErrorBoundary } from "./App";
import { WorkshopProvider } from "./lib/store";
import "./design/tokens.css";
import "./styles.css";
import "./design/primitives.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorkshopProvider>
        <App />
      </WorkshopProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
