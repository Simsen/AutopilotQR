import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Clickjacking guard: GitHub Pages cannot send frame-ancestors / X-Frame-Options headers.
if (window.top !== window.self) {
  document.body.innerHTML = "<p style='font:16px system-ui;padding:16px'>This app cannot run inside a frame.</p>";
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
