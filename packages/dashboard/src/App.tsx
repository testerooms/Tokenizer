import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(!!s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(!!session);
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
    return <Login onAuth={() => setSession(true)} />;
  }

  return <Dashboard />;
}
