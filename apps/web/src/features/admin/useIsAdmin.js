import { useEffect, useState } from "react";
import { fetchIsAdmin } from "../../api/adminAccess.js";

/**
 * Is this person an admin? null while it's being checked, false when signed out. One
 * tiny read per page load (api/adminAccess.js keeps the answer). It only decides what
 * is shown; the database checks again on every admin call.
 */
export function useIsAdmin(user) {
  const id = user?.id ?? null;
  const [answer, setAnswer] = useState({ id: null, admin: null });
  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchIsAdmin(id).then((admin) => live && setAnswer({ id, admin }));
    return () => {
      live = false;
    };
  }, [id]);
  if (!id) return false;
  return answer.id === id ? answer.admin : null;
}
