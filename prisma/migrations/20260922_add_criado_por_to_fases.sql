-- Migration: rastreio de criador nas fases (colunas que POST /api/projetos
-- já tenta gravar; sem elas, toda criação de projeto falha 1x e só
-- funciona no fallback, gerando erro e escrita dupla no log).

ALTER TABLE public.fases_acao
ADD COLUMN IF NOT EXISTS criado_por_email TEXT;

ALTER TABLE public.fases_acao
ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_fases_acao_criado_por_email
ON public.fases_acao(criado_por_email);
