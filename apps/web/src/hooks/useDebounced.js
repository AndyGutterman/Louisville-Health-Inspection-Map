import { useEffect, useState } from "react";

// The value, once it has stopped changing for `ms`. The first value is given at once.
export function useDebounced(value, ms = 200) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
