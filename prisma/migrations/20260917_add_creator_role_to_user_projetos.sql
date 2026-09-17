-- ============================================================
-- Migration: Add role to user_projetos (creator/member)
-- Add criado_por to projetos_irrigacao for quick access
-- Data: 2026-09-17
-- ============================================================

-- 1. Add role column to user_projetos
ALTER TABLE user_projetos 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

-- Add check constraint for valid roles
ALTER TABLE user_projetos 
DROP CONSTRAINT IF EXISTS chk_user_projetos_role;

ALTER TABLE user_projetos 
ADD CONSTRAINT chk_user_projetos_role 
CHECK (role IN ('creator', 'member'));

-- 2. Add criado_por to projetos_irrigacao for quick access to creator
ALTER TABLE projetos_irrigacao 
ADD COLUMN IF NOT EXISTS criado_por TEXT;

-- Add foreign key for criado_por
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projetos_irrigacao_criado_por'
  ) THEN
    ALTER TABLE projetos_irrigacao 
      ADD CONSTRAINT fk_projetos_irrigacao_criado_por 
      FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_user_projetos_role ON user_projetos(role);
CREATE INDEX IF NOT EXISTS idx_projetos_irrigacao_criado_por ON projetos_irrigacao(criado_por);

-- 4. Update existing records: first user in each project becomes creator
-- This is a best-effort migration for existing data
UPDATE user_projetos up
SET role = 'creator'
WHERE up.id IN (
  SELECT DISTINCT ON (up2.projeto_id) up2.id
  FROM user_projetos up2
  ORDER BY up2.projeto_id, up2.created_at
);

-- For projects without any user_projetos entry, try to find creator from users table
-- (only if there's a single user with Agricultor role who might be the creator)
-- This is a fallback and may need manual adjustment

-- ============================================================
-- NOTE: After running this migration:
-- - New projects will automatically have creator set via API
-- - Existing projects need manual review to set correct creators
-- ============================================================