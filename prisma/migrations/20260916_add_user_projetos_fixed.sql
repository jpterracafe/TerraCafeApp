-- ============================================================
-- Migração: Vinculação de Projetos por Usuário / Email
-- Arquivo: prisma/migrations/20260916_add_user_projetos_fixed.sql
-- ============================================================

-- 1. Tabela relacional de vínculo entre usuário e projetos
CREATE TABLE IF NOT EXISTS user_projetos (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_email   TEXT NOT NULL,
  user_id      TEXT,
  projeto_nome TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'owner', -- 'owner' (criador) | 'editor' | 'viewer'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Desabilitar RLS para permitir controle pela camada da aplicação Next.js
ALTER TABLE user_projetos DISABLE ROW LEVEL SECURITY;

-- Índices de performance para busca por email e por projeto
CREATE INDEX IF NOT EXISTS idx_user_projetos_email ON user_projetos(user_email);
CREATE INDEX IF NOT EXISTS idx_user_projetos_projeto ON user_projetos(projeto_nome);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_projetos_unique ON user_projetos(user_email, projeto_nome);

-- 2. Colunas complementares nas fases para rastreabilidade direta
ALTER TABLE fases_acao ADD COLUMN IF NOT EXISTS criado_por_email TEXT;
ALTER TABLE fases_acao ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;

-- 3. Coluna na tabela de projetos_irrigacao se existir
ALTER TABLE projetos_irrigacao ADD COLUMN IF NOT EXISTS criado_por_email TEXT;
