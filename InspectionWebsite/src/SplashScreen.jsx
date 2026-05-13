import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const FADE_DURATION = 600; // must match splash-out animation duration in CSS

// SplashScreen.jsx — add timedOut prop
export default function SplashScreen({ isLoading, timedOut }) {
  const [fadeOut, setFadeOut] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      const fadeTimer = setTimeout(() => setFadeOut(true), 150);
      const removeTimer = setTimeout(() => setUnmounted(true), 150 + FADE_DURATION);
      return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
    }
  }, [isLoading]);

  if (unmounted) return null;

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <div className="splash-bg" />
      <div className="splash-content">
        <div className="splash-brand">
          <div className="splash-word"><span className="word-red">LOADING</span></div>
          <div className="splash-word"><span className="word-yellow">HEALTH</span></div>
          <div className="splash-word"><span className="word-green">SCORES</span></div>
        </div>

        <p className="splash-tagline">Health Inspections at a Glance</p>

        {/* Swap loader for error message on timeout */}
        {timedOut ? (
          <div className="splash-timeout">
            <p>Taking longer than expected.</p>
            <p>The map may load or die trying.</p>
          </div>
        ) : (
          <div className="splash-loader">
            <div className="loader-track">
              <div className="loader-bar" />
            </div>
            <p className="loader-text">Retrieving map data...</p>
          </div>
        )}
      </div>
      <div className="splash-accent-top" />
    </div>
  );
}