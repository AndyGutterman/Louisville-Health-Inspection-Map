import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Map from "./Map.jsx";
import withSplashScreen from "./withSplashScreen.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { I18nProvider } from "./I18nContext.jsx";

const MapWithSplash = withSplashScreen(Map);

createRoot(document.getElementById("root")).render(
  <I18nProvider>
    <AuthProvider>
      <MapWithSplash />
    </AuthProvider>
  </I18nProvider>,
);
