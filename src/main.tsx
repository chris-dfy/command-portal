import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { portalBrand } from "./brand";
import "./styles.css";

document.title = `${portalBrand.displayName} — Enterprise Executive OS`;
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
