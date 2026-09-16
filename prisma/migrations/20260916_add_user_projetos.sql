-- Migration: Adiciona tabela user_projetos para associação usuário-projeto
-- Data: 2026-09-16
-- Descrição: Cria tabela para permitir que cada agricultor veja apenas seus projetos

-- 1. Cria tabela de associação usuário-projeto
CREATE TABLE IF NOT EXISTS user_projetos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  projeto_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, projeto_id)
);

-- 2. Adiciona chaves estrangeiras
ALTER TABLE user_projetos 
  ADD CONSTRAINT fk_user_projetos_user 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_projetos 
  ADD CONSTRAINT fk_user_projetos_projeto 
  FOREIGN KEY (projeto_id) REFERENCES projetos_irrigacao(id) ON DELETE CASCADE;

-- 3. Cria índices para performance
CREATE INDEX IF NOT EXISTS idx_user_projetos_user_id ON user_projetos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projetos_projeto_id ON user_projetos(projeto_id);

-- 4. Habilita RLS (Row Level Security)
ALTER TABLE user_projetos ENABLE ROW LEVEL SECURITY;

-- 5. Política: usuários autenticados podem ver suas próprias associações
CREATE POLICY "Users can view their own project associations" ON user_projetos
  FOR SELECT USING (auth.uid()::text = user_id OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role IN ('Desenvolvedor', 'Diretor', 'Administrador')));

-- 6. Política: só admin pode inserir/deletar associações
CREATE POLICY "Only admins can manage project associations" ON user_projetos
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role IN ('Desenvolvedor', 'Administrador')));