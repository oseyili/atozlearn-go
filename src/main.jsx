import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as AppModule from "./App.jsx";
import "./index.css";
const ResolvedApp =
  (AppModule && (AppModule.default || AppModule.App)) ||
  (() => (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <b>App export missing.</b> Please ensure src/App.jsx exports default or named App.
    </div>
  ));

const ResolvedApp =
  (AppModule && (AppModule.default || AppModule.App)) ||
  (() => (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <b>App export missing.</b> Please ensure src/App.jsx exports default or named App.
    </div>
  ));
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ResolvedApp />
  </BrowserRouter>
);



