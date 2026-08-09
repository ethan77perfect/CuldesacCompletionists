// ---------------------------------------------------------------
// main.jsx — the entry point. Vite serves index.html, which loads
// this file, which mounts the <App /> component into the <div
// id="root"> element. StrictMode is a dev-only helper that runs
// components twice to surface bugs; it has no effect in production.
// You will almost never need to edit this file.
// ---------------------------------------------------------------
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
