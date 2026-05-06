import React, { useCallback, useEffect, useRef, useState } from 'react';
import SplashScreen from './SplashScreen';

const MIN_DURATION = 600; // ms — prevents a flash on fast connections

/**
 * withSplashScreen HOC
 * Wraps main component with a loading splash screen.
 * Dismisses only after BOTH:
 *   1. The wrapped component calls props.onMapReady()
 *   2. MIN_DURATION ms have elapsed
 *
 * Usage:
 *   export default withSplashScreen(Map);
 *
 * Inside Map, call props.onMapReady() once the map is fully loaded:
 *   map.on('load', () => {
 *     // ... add sources, layers, etc.
 *     props.onMapReady?.();
 *   });
 */
export default function withSplashScreen(WrappedComponent) {
  return function SplashScreenWrapper(props) {
    const [isLoading, setIsLoading] = useState(true);
    const minElapsedRef = useRef(false);
    const mapReadyRef = useRef(false);

    // Start the minimum-duration timer immediately on mount
    useEffect(() => {
      const t = setTimeout(() => {
        minElapsedRef.current = true;
        // If the map already signalled ready before the timer fired, dismiss now
        if (mapReadyRef.current) setIsLoading(false);
      }, MIN_DURATION);
      return () => clearTimeout(t);
    }, []);

    const onMapReady = useCallback(() => {
      mapReadyRef.current = true;
      // Only dismiss if the minimum duration has also elapsed
      if (minElapsedRef.current) setIsLoading(false);
    }, []);

    return (
      <>
        <SplashScreen isLoading={isLoading} />
        <WrappedComponent {...props} splashLoading={isLoading} onMapReady={onMapReady} />
      </>
    );
  };
}