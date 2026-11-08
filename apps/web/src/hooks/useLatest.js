import { useLayoutEffect, useRef } from "react";

// A ref that always holds the latest value. Map event handlers are registered once, when
// the map loads; reading state through this ref gives them the current value instead of
// the value from that first render.
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
