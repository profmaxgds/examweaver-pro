-- Adicionar a coluna de instruções à tabela de provas, se ainda não existir.
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS instructions TEXT;

-- Adicionar a coluna para o ID do cabeçalho, se ainda não existir.
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS header_id UUID;

-- Adicionar a restrição de chave estrangeira para garantir a integridade dos dados,
-- ligando a prova ao seu cabeçalho.
-- Isso também permite que o Supabase identifique a relação e facilite as consultas.
ALTER TABLE public.exams
ADD CONSTRAINT exams_header_id_fkey
FOREIGN KEY (header_id)
REFERENCES public.exam_headers(id)
ON DELETE SET NULL;