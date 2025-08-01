-- Primeiro, verificar se a tabela student_exams precisa ser atualizada ou se as colunas estão corretas
-- Adicionar colunas que podem estar faltando na tabela exams
ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS generation_mode text DEFAULT 'versions'::text,
ADD COLUMN IF NOT EXISTS target_class_id uuid;

-- Verificar se a tabela student_exams tem a estrutura correta
-- Se não existir, criar ela
CREATE TABLE IF NOT EXISTS public.student_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL,
  student_id uuid NOT NULL,
  author_id uuid NOT NULL,
  shuffled_question_ids uuid[] NOT NULL DEFAULT '{}',
  shuffled_options_map jsonb NOT NULL DEFAULT '{}',
  answer_key jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id)
);

-- Habilitar RLS na tabela student_exams se não estiver habilitado
ALTER TABLE public.student_exams ENABLE ROW LEVEL SECURITY;

-- Criar/recriar políticas RLS para student_exams
DROP POLICY IF EXISTS "Users can manage their own student exams" ON public.student_exams;
CREATE POLICY "Users can manage their own student exams" 
ON public.student_exams 
FOR ALL 
USING (auth.uid() = author_id);

-- Verificar se a coluna text_lines existe na tabela questions
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS text_lines integer;

-- Criar função para atualizar updated_at se não existir
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para student_exams se não existir
DROP TRIGGER IF EXISTS update_student_exams_updated_at ON public.student_exams;
CREATE TRIGGER update_student_exams_updated_at
  BEFORE UPDATE ON public.student_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Criar trigger para exams se não existir
DROP TRIGGER IF EXISTS update_exams_updated_at ON public.exams;
CREATE TRIGGER update_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_student_exams_exam_id ON public.student_exams(exam_id);
CREATE INDEX IF NOT EXISTS idx_student_exams_student_id ON public.student_exams(student_id);
CREATE INDEX IF NOT EXISTS idx_student_exams_author_id ON public.student_exams(author_id);
CREATE INDEX IF NOT EXISTS idx_exams_target_class_id ON public.exams(target_class_id);
CREATE INDEX IF NOT EXISTS idx_exams_generation_mode ON public.exams(generation_mode);