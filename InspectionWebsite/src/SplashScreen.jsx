import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const FADE_DURATION = 600; // must match splash-out animation duration in CSS

export default function SplashScreen({ isLoading }) {
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
      {/* Animated gradient background */}
      <div className="splash-bg" />

      {/* Main content container */}
      <div className="splash-content">
        {/* Brand text — no icon */}
        <div className="splash-brand">
          <div className="splash-word">
            <span className="word-red">LOADING</span>
          </div>
          <div className="splash-word">
            <span className="word-yellow">HEALTH</span>
          </div>
          <div className="splash-word">
            <span className="word-green">SCORES</span>
          </div>
        </div>

        {/* Tagline */}
        <p className="splash-tagline">Health Inspections at a Glance</p>

        {/* Loading indicator */}
        <div className="splash-loader">
          <div className="loader-track">
            <div className="loader-bar" />
          </div>
          <p className="loader-text">Retrieving map data...</p>
        </div>
      </div>

      {/* Animated accent bars */}
      <div className="splash-accent-top" />
    </div>
  );
}