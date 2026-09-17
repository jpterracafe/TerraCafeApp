-- ============================================================
-- Migration: user_projetos (associação usuário-projeto)
-- Compatível com: branch1 do TerraCafeApp
-- Data: 2026-09-16
-- ============================================================

-- 1. Cria tabela de associação usuário-projeto
CREATE TABLE IF NOT EXISTS user_projetos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  projeto_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, projeto_id)
);

-- 2. Chaves estrangeiras (só adiciona se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_projetos_user'
  ) THEN
    ALTER TABLE user_projetos 
      ADD CONSTRAINT fk_user_projetos_user 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_projetos_projeto'
  ) THEN
    ALTER TABLE user_projetos 
      ADD CONSTRAINT fk_user_projetos_projeto 
      FOREIGN KEY (projeto_id) REFERENCES projetos_irrigacao(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_projetos_user_id ON user_projetos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projetos_projeto_id ON user_projetos(projeto_id);

-- ============================================================
-- NOTA: Não habilitar RLS nesta tabela.
-- O projeto usa NextAuth (não Supabase Auth), então as queries
-- são feitas via API routes com service_role key.
-- O controle de acesso é feito no código (lib/roles.ts).
-- ============================================================