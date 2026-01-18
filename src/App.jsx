import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import PortalPage from "./pages/PortalPage.jsx";
import CoursePage from "./pages/CoursePage.jsx";
import AdminPaymentsPage from "./pages/AdminPaymentsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/portal" replace />} />

      <Route path="/portal" element={<PortalPage />} />
      <Route path="/course/:courseId" element={<CoursePage />} />

      {/* Admin */}
      <Route path="/admin/payments" element={<AdminPaymentsPage />} />

      <Route path="/success" element={<Navigate to="/portal" replace />} />
      <Route path="/cancel" element={<Navigate to="/portal" replace />} />

      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}
