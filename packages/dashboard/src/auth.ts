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

  const metadataRole = user.user_metadata?.role as string | undefined;
  return {
    id: user.id,
    email: user.email ?? "unknown",
    role: metadataRole === "admin" ? "admin" : "viewer",
    name: (user.user_metadata?.name as string) ?? user.email?.split("@")[0] ?? "unknown",
  };
}
