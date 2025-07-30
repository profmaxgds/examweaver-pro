-- Adicionar a restrição de chave estrangeira que faltava
ALTER TABLE public.exams
ADD CONSTRAINT exams_header_id_fkey
FOREIGN KEY (header_id)
REFERENCES public.exam_headers(id)
ON DELETE SET NULL;

-- Adicionar a coluna de instruções que pode ter faltado
ALTER TABLE public.exams
ADD COLUMN IF NOT EXISTS instructions TEXT;