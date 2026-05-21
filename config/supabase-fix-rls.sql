-- Run this in Supabase SQL Editor to fix the infinite recursion in profiles RLS
-- This replaces the broken "Admins can read all profiles" policy

-- 1. Drop the old broken policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- 2. Create SECURITY DEFINER helper (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 3. Re-create policies with the fixed admin check
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());
