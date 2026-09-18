-- Migration: Add user_email column to responsaveis table for per-farmer isolation
-- This allows each agricultor to have their own private list of responsaveis

-- 1. Add user_email column
ALTER TABLE public.responsaveis 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 2. Create index for faster lookups by user_email
CREATE INDEX IF NOT EXISTS idx_responsaveis_user_email 
ON public.responsaveis(user_email);

-- 3. Optional: Backfill existing records with a default email (for legacy data)
-- This assumes existing manual entries should belong to a specific admin user
-- Update this email to match your admin user
UPDATE public.responsaveis 
SET user_email = 'admin@terracafe.com' 
WHERE user_email IS NULL 
  AND origem = 'MANUAL';

-- 4. For BANCO_DADOS entries, we might want to make them visible to all or assign to admin
-- This is a design decision - here we assign to admin so they can manage them
UPDATE public.responsaveis 
SET user_email = 'admin@terracafe.com' 
WHERE user_email IS NULL 
  AND origem = 'BANCO_DADOS';

-- 5. Verify the changes
-- SELECT id, nome, origem, user_email FROM public.responsaveis ORDER BY created_at;