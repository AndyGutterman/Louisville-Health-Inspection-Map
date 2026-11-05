import { useEffect, useState } from "react";

// True while the window matches a CSS media query, for example
// useMediaQuery("(max-width: 600px)"). Updates when the window crosses the breakpoint.
export function useMediaQuery(query) {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange(); // catch a change between the first render and now
    // Older Safari only has addListener / removeListener.
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
