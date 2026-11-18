import React, { useEffect, useState } from "react";
import "./SplashScreen.css";
import { useT } from "./I18nContext.jsx";

const FADE_DURATION = 600; // must match splash-out animation duration in CSS

export default function SplashScreen({ isLoading, timedOut }) {
  const { t } = useT();
  const [fadeOut, setFadeOut] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      const fadeTimer = setTimeout(() => setFadeOut(true), 150);
      const removeTimer = setTimeout(() => setUnmounted(true), 150 + FADE_DURATION);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [isLoading]);

  if (unmounted) return null;

  return (
    <div data-testid="splash-screen" className={`splash-screen ${fadeOut ? "fade-out" : ""}`}>
      <div className="splash-bg" />
      <div className="splash-content">
        <div className="splash-brand">
          <div className="splash-word">
            <span className="word-red">{t("splash.loading")}</span>
          </div>
          <div className="splash-word">
            <span className="word-yellow">{t("splash.health")}</span>
          </div>
          <div className="splash-word">
            <span className="word-green">{t("splash.scores")}</span>
          </div>
        </div>

        <p className="splash-tagline">{t("splash.tagline")}</p>

        {/* Swap loader for error message on timeout */}
        {timedOut ? (
          <div className="splash-timeout">
            <p>{t("splash.slow")}</p>
            <p>{t("splash.slow2")}</p>
          </div>
        ) : (
          <div className="splash-loader">
            <div className="loader-track">
              <div className="loader-bar" />
            </div>
            <p className="loader-text">{t("splash.retrieving")}</p>
          </div>
        )}
      </div>
      <div className="splash-accent-top" />
    </div>
  );
}
