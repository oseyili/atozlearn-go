import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// ✅ Make sure this file exists: src/supabaseClient.js (or .ts)
import { supabase } from "./supabaseClient";

// ✅ TEMP DEBUG: log session in console
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error("❌ Supabase getSession() error:", error);
    return;
  }
  console.log("🔐 Supabase session:", data?.session ?? null);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
