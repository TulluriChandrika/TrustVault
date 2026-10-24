-- Migration: Add description column to public.documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description TEXT;
