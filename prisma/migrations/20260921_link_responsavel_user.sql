-- Migration: vínculo responsável <-> login + rastreio de quem cadastrou
-- Permite ao admin (João Pedro) ver todos os responsáveis, diferenciar quem
-- já tem login (agricultor) de quem foi criado por agricultor (sem login),
-- e criar um login para esses últimos sem gerar conflito de nomes.

-- 1. Colunas de vínculo com users
ALTER TABLE public.responsaveis
ADD COLUMN IF NOT EXISTS user_id TEXT;

ALTER TABLE public.responsaveis
ADD COLUMN IF NOT EXISTS criado_por_email TEXT;

ALTER TABLE public.responsaveis
ADD COLUMN IF NOT EXISTS criado_por_nome TEXT;

-- Garante que user_email exista (criada em migração anterior)
ALTER TABLE public.responsaveis
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_responsaveis_user_email
ON public.responsaveis(user_email);

CREATE INDEX IF NOT EXISTS idx_responsaveis_user_id
ON public.responsaveis(user_id);

-- 3. Backfill do DONO antes de qualquer vínculo: preserva quem cadastrou.
-- (Em bancos onde user_email = e-mail do criador, ele vira criado_por_email.
--  Precisa rodar ANTES do passo 4, que reutiliza user_email p/ o login.)
UPDATE public.responsaveis
SET criado_por_email = user_email
WHERE criado_por_email IS NULL
  AND user_email IS NOT NULL;

-- 4. Backfill: se já existe um user com o mesmo nome do responsável,
-- preenche user_id/user_email para marcar "tem login" automaticamente.
-- (match case-insensitive, sem acento aproximado — o app faz o match
-- normalizado em runtime; aqui é só uma ajuda inicial)
UPDATE public.responsaveis r
SET user_id = u.id,
    user_email = u.email
FROM public.users u
WHERE r.user_id IS NULL
  AND r.user_email IS NULL
  AND r.nome IS NOT NULL
  AND u.name IS NOT NULL
  AND lower(trim(r.nome)) = lower(trim(u.name));
