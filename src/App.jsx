import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import PortalPage from "./pages/PortalPage.jsx";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/portal" replace />} />
      <Route path="/portal" element={<PortalPage />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}

export default App;
