import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { getProfile, type UserProfile } from "./auth";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  async function fetchProfile() {
    setProfileLoading(true);
    const p = await getProfile();
    setProfile(p);
    setProfileLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(!!s);
      if (s) fetchProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(!!session);
      if (event === "SIGNED_IN" && session) {
        fetchProfile();
      }
      if (event === "SIGNED_OUT") {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0b0e1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        color: "#64748b",
        fontSize: 13,
      }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Login onAuth={() => { setSession(true); fetchProfile(); }} />;
  }

  if (profileLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0b0e1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        color: "#64748b",
        fontSize: 13,
      }}>
        Loading profile...
      </div>
    );
  }

  return <Dashboard profile={profile!} />;
}
