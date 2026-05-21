import { supabase } from "./supabase";

export interface UserProfile {
  id: string;
  email: string;
  role: "admin" | "viewer";
  name: string;
}

export async function getProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, name")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return {
      id: user.id,
      email: user.email ?? "unknown",
      role: "viewer",
      name: user.email?.split("@")[0] ?? "unknown",
    };
  }

  return data;
}
