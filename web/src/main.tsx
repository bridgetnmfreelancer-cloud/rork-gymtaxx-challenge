import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

/**
 * Register the service worker after load, so it never competes with the first
 * paint. Without it the app can't be launched reliably from the Home Screen
 * with a poor signal, which is the whole point of installing.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      // Registration failing costs the offline shell, not the app.
      console.error("pwa: service worker registration failed", error);
    });
  });
}
