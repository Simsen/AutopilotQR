import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Strict CSP for production builds only (Vite dev needs inline scripts for HMR).
// GitHub Pages cannot send headers, so the policy is a <meta> tag.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com",
  "frame-src https://login.microsoftonline.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://login.microsoftonline.com",
].join("; ");

const csp = (): Plugin => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<!--CSP-->", `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  plugins: [react(), csp()],
  // "/" for a custom domain; "/<repo>/" for https://<user>.github.io/<repo>/ (set by the deploy workflow).
  base: process.env.VITE_BASE_PATH || "/",
  build: { target: "es2022", sourcemap: false },
  test: { environment: "node" },
});
