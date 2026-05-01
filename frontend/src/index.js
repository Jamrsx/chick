import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./main";
import "./index.css";



// If you want to use reportWebVitals, import it
// import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// ✅ Option 1: Remove reportWebVitals if not needed
// If you want to use it, uncomment the import and the line below
// reportWebVitals(console.log);