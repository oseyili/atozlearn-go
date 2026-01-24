import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MasterPortal from "./pages/MasterPortal";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal" element={<MasterPortal />} />
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
