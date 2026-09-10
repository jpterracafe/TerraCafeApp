-- Execute este SQL no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/SEU_PROJECT_ID/sql/new

-- ============================================================
-- TABELA: usuários do sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT,
  email       TEXT UNIQUE,
  password    TEXT NOT NULL,
  senha_temp  TEXT,
  role        TEXT NOT NULL DEFAULT 'Colaborador',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS senha_temp TEXT;

-- ============================================================
-- TABELA: projetos de irrigação (importados via CSV)
-- ============================================================
CREATE TABLE IF NOT EXISTS projetos_irrigacao (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  id_firebird           INTEGER UNIQUE,
  nome                  TEXT NOT NULL,
  status                TEXT,
  responsavel           TEXT,
  data_inicio           TIMESTAMPTZ,
  area_total            FLOAT,
  ultima_sincronizacao  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: responsáveis (equipe de campo)
-- ============================================================
CREATE TABLE IF NOT EXISTS responsaveis (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome       TEXT NOT NULL,
  cargo      TEXT NOT NULL,
  origem     TEXT NOT NULL DEFAULT 'MANUAL', -- 'MANUAL' | 'BANCO_DADOS'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: fases / ações de projetos
-- ============================================================
CREATE TABLE IF NOT EXISTS fases_acao (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  gabarito     TEXT NOT NULL,
  responsavel  TEXT NOT NULL DEFAULT 'Não atribuído',
  acao         TEXT NOT NULL DEFAULT 'Cotar',
  prazo_limite DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Dentro do programado',
  observacoes  TEXT,
  projeto_cliente TEXT,
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: diário de campo (logs diários por responsável)
-- ============================================================
CREATE TABLE IF NOT EXISTS diario_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data            DATE NOT NULL,
  responsavel     TEXT NOT NULL,
  atividade       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Dentro do Programado',
  observacoes     TEXT NOT NULL DEFAULT '',
  projeto_cliente TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Desabilitar RLS — acesso controlado pelo service role key
-- ============================================================
ALTER TABLE users              DISABLE ROW LEVEL SECURITY;
ALTER TABLE projetos_irrigacao DISABLE ROW LEVEL SECURITY;
ALTER TABLE responsaveis       DISABLE ROW LEVEL SECURITY;
ALTER TABLE fases_acao         DISABLE ROW LEVEL SECURITY;
ALTER TABLE diario_logs        DISABLE ROW LEVEL SECURITY;

-- Histórico de alterações de fases
CREATE TABLE IF NOT EXISTS historico_fases (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fase_id       TEXT NOT NULL REFERENCES fases_acao(id) ON DELETE CASCADE,
  campo         TEXT NOT NULL,
  valor_anterior TEXT NOT NULL DEFAULT '',
  valor_novo    TEXT NOT NULL DEFAULT '',
  usuario       TEXT NOT NULL DEFAULT 'Sistema',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_historico_fases_fase_id ON historico_fases(fase_id);

-- Configurações globais do sistema (etapas, metas, prazos finais, starts, justificativas)
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  chave       TEXT PRIMARY KEY,
  valor       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE configuracoes_sistema DISABLE ROW LEVEL SECURITY;

-- Coluna de mídia no diário de logs
ALTER TABLE diario_logs ADD COLUMN IF NOT EXISTS midia_url TEXT;
ALTER TABLE diario_logs ADD COLUMN IF NOT EXISTS midia_tipo TEXT; -- 'image' | 'video'

-- ============================================================
-- ÍNDICES DE PERFORMANCE — rodar no Supabase SQL Editor
-- ============================================================

-- fases_acao: filtro de lixeira (is_deleted) — usado em quase toda query
CREATE INDEX IF NOT EXISTS idx_fases_acao_is_deleted
  ON fases_acao(is_deleted);

-- fases_acao: agrupamento por projeto no dashboard
CREATE INDEX IF NOT EXISTS idx_fases_acao_projeto_cliente
  ON fases_acao(projeto_cliente)
  WHERE projeto_cliente IS NOT NULL;

-- fases_acao: filtro combinado (ativo por projeto) — cobre o padrão mais comum
CREATE INDEX IF NOT EXISTS idx_fases_acao_projeto_deleted
  ON fases_acao(projeto_cliente, is_deleted);

-- diario_logs: ordenação principal em todas as queries
CREATE INDEX IF NOT EXISTS idx_diario_logs_data
  ON diario_logs(data DESC);

-- diario_logs: filtro por responsável no diário de campo
CREATE INDEX IF NOT EXISTS idx_diario_logs_responsavel
  ON diario_logs(responsavel);

-- diario_logs: filtro + delete por projeto
CREATE INDEX IF NOT EXISTS idx_diario_logs_projeto_cliente
  ON diario_logs(projeto_cliente)
  WHERE projeto_cliente IS NOT NULL;

-- diario_logs: índice composto para a query mais comum (responsavel + data)
CREATE INDEX IF NOT EXISTS idx_diario_logs_resp_data
  ON diario_logs(responsavel, data DESC);
