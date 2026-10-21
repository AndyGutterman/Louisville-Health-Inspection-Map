import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice]   = useState(null); // small toast, e.g. after unsubscribing

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // One-click unsubscribe from the digest email footer: /?unsubscribe=<token>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("unsubscribe");
    if (!token) return;
    params.delete("unsubscribe");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    supabase.rpc("unsubscribe_by_token", { p_token: token }).then(({ data, error }) => {
      setNotice(!error && data
        ? "You're unsubscribed from alert emails."
        : "That unsubscribe link isn't valid. You can turn alerts off in your account.");
      setTimeout(() => setNotice(null), 6000);
    });
  }, []);

  // Sends an email containing a 6-digit code (and a fallback link).
  // Returns { error } — null error means the email was sent.
  async function sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  }

  // Verifies the 6-digit code typed into the login modal.
  // On success, onAuthStateChange fires and `user` updates on its own.
  async function verifyCode(email, code) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: String(code).trim(),
      type: "email",
    });
    return { data, error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, sendMagicLink, verifyCode, signOut, supabase }}>
      {children}
      {notice && (
        <div role="status" style={{
          position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
          zIndex: 9999, padding: "10px 18px", borderRadius: 999,
          background: "rgba(20,20,24,0.97)", border: "1px solid rgba(255,255,255,0.16)",
          color: "#f0f0f3", fontSize: ".84rem", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>{notice}</div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
