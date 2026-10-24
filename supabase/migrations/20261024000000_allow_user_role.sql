-- Migration: Update user roles to include 'user' as default role and add full_name
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users 
  ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'user', 'owner', 'viewer'));

UPDATE public.users 
SET role = 'user' 
WHERE role = 'owner';
