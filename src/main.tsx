import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { portalBrand } from "./brand";
import "./styles.css";

document.title = `${portalBrand.displayName} Portal`;
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
