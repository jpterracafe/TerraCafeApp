-- Migration: soft-delete real para diario_logs
-- DELETE/PATCH /api/projetos já tentam marcar is_deleted nos logs, mas a
-- coluna não existia — o update falhava em silêncio e os logs de projetos
-- na lixeira continuavam aparecendo no diário.

ALTER TABLE public.diario_logs
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_diario_logs_is_deleted
ON public.diario_logs(is_deleted);
