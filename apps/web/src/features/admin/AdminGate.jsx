// The frame and the door of the site's admin pages (the email admin page, the pin control
// center): a full-screen page under the header that shows its content only to an admin.
//
// What is shown here is a convenience. The lock is in the database: every admin_* call
// checks the signed-in person against admin_users (migration 20261125000000).
import { useAuth } from "../../AuthContext.jsx";
import { useIsAdmin } from "./useIsAdmin.js";
import "../../styles/AdminPage.css";

/** The page's frame. `wide` for a page with a map beside a list (the pin control center). */
export function AdminShell({ children, wide = false }) {
  return (
    <div className="adm-wrap" data-testid="admin-page">
      <div className={`adm-page${wide ? " adm-page--wide" : ""}`}>{children}</div>
    </div>
  );
}

function Gate({ title, children }) {
  return (
    <AdminShell>
      <div className="adm-gate" data-testid="admin-gate">
        <div className="adm-title">{title}</div>
        {children}
      </div>
    </AdminShell>
  );
}

/**
 * Shows `children(user)` to an admin; to anyone else, a way to sign in or a polite no.
 * @param {{ title: string, purpose: string, onLogIn: Function, children: Function }} p
 *   purpose: what an admin signs in to do, e.g. "manage the site's email"
 */
export default function AdminGate({ title, purpose, onLogIn, children }) {
  const { user, loading } = useAuth();
  const admin = useIsAdmin(user);

  if (loading || (user && admin === null)) return <Gate title="Checking…" />;
  if (!user) {
    return (
      <Gate title={title}>
        <p className="adm-dim">Sign in with an admin account to {purpose}.</p>
        <button type="button" className="adm-btn adm-btn--go" onClick={onLogIn}>
          Log in
        </button>
      </Gate>
    );
  }
  if (!admin) {
    return (
      <Gate title="Admins only">
        <p className="adm-dim">{user.email} isn&apos;t an admin of this site.</p>
      </Gate>
    );
  }
  return children(user);
}
