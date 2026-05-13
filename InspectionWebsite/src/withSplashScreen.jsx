import React, { useCallback, useEffect, useRef, useState } from 'react';
import SplashScreen from './SplashScreen';

const MIN_DURATION = 555;
const MAX_DURATION = 8000;
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
    const [timedOut, setTimedOut] = useState(false);
    const minElapsedRef = useRef(false);
    const mapReadyRef = useRef(false);
    const doneRef = useRef(false);

    const dismiss = useCallback((timeout = false) => {
      if (doneRef.current) return; // prevent double-firing
      doneRef.current = true;
      if (timeout) setTimedOut(true);
      setIsLoading(false);
    }, []);

    useEffect(() => {
      const minTimer = setTimeout(() => {
        minElapsedRef.current = true;
        if (mapReadyRef.current) dismiss();
      }, MIN_DURATION);

      // Hard ceiling — never spin forever
      const maxTimer = setTimeout(() => {
        dismiss(true);
      }, MAX_DURATION);

      return () => {
        clearTimeout(minTimer);
        clearTimeout(maxTimer);
      };
    }, [dismiss]);

    const onMapReady = useCallback(() => {
      mapReadyRef.current = true;
      if (minElapsedRef.current) dismiss();
    }, [dismiss]);

    return (
      <>
        <SplashScreen isLoading={isLoading} timedOut={timedOut} />
        <WrappedComponent {...props} splashLoading={isLoading} onMapReady={onMapReady} />
      </>
    );
  };
}