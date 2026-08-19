import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n";
import "./styles.css";

const router = createBrowserRouter([{
  path: "*",
  element: <I18nProvider><App /></I18nProvider>,
}]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
