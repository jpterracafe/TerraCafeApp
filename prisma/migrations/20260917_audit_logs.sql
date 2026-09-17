-- ============================================================
-- Migration: Audit Logs System
-- Tabela para rastrear todas as ações importantes do sistema
-- Data: 2026-09-17
-- ============================================================

-- Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id      TEXT NOT NULL,
  usuario_nome    TEXT,
  usuario_email   TEXT,
  usuario_role    TEXT,
  acao            TEXT NOT NULL,        -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'IMPERSONATE'
  entidade        TEXT NOT NULL,        -- 'projeto', 'fase', 'responsavel', 'usuario', 'configuracao', 'diario'
  entidade_id     TEXT,                 -- ID da entidade afetada
  entidade_nome   TEXT,                 -- Nome legível da entidade (ex: nome do projeto)
  dados_anteriores JSONB,               -- Estado antes da mudança
  dados_novos     JSONB,               -- Estado depois da mudança
  ip              TEXT,
  user_agent      TEXT,
  metadata        JSONB,               -- Contexto adicional (ex: {motivo: "..."})
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas comuns
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario_id ON audit_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entidade ON audit_logs(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_acao ON audit_logs(acao);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario_created ON audit_logs(usuario_id, created_at DESC);

-- Desabilitar RLS (acesso via service_role)
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Função helper para inserir auditoria (pode ser chamada via RPC)
-- CREATE OR REPLACE FUNCTION log_audit(
--   p_usuario_id TEXT,
--   p_usuario_nome TEXT,
--   p_usuario_email TEXT,
--   p_usuario_role TEXT,
--   p_acao TEXT,
--   p_entidade TEXT,
--   p_entidade_id TEXT,
--   p_entidade_nome TEXT,
--   p_dados_anteriores JSONB,
--   p_dados_novos JSONB,
--   p_ip TEXT,
--   p_user_agent TEXT,
--   p_metadata JSONB
-- ) RETURNS VOID AS $$
-- BEGIN
--   INSERT INTO audit_logs (
--     usuario_id, usuario_nome, usuario_email, usuario_role,
--     acao, entidade, entidade_id, entidade_nome,
--     dados_anteriores, dados_novos, ip, user_agent, metadata
--   ) VALUES (
--     p_usuario_id, p_usuario_nome, p_usuario_email, p_usuario_role,
--     p_acao, p_entidade, p_entidade_id, p_entidade_nome,
--     p_dados_anteriores, p_dados_novos, p_ip, p_user_agent, p_metadata
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;