import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jua/korean-400.css";
import "@fontsource/jua/latin-400.css";
import "@fontsource/noto-sans-kr/korean-400.css";
import "@fontsource/noto-sans-kr/korean-500.css";
import "@fontsource/noto-sans-kr/korean-600.css";
import "@fontsource/noto-sans-kr/korean-700.css";
import "@fontsource/noto-sans-kr/latin-400.css";
import "@fontsource/noto-sans-kr/latin-500.css";
import "@fontsource/noto-sans-kr/latin-700.css";
import App, { ErrorBoundary } from "./App";
import { WorkshopProvider } from "./lib/store";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorkshopProvider>
        <App />
      </WorkshopProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
