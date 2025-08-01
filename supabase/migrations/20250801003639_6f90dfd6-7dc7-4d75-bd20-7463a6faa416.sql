-- Adicionar as tabelas students e classes que estão faltando no esquema
-- Também vamos adicionar a coluna text_lines na tabela questions

-- Adicionar coluna text_lines na tabela questions
ALTER TABLE public.questions 
ADD COLUMN text_lines integer DEFAULT NULL;

-- Criar tabela classes se não existir
CREATE TABLE IF NOT EXISTS public.classes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  year integer,
  semester integer,
  institution_header_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS na tabela classes
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para classes
CREATE POLICY "Users can view their own classes" 
ON public.classes 
FOR SELECT 
USING (auth.uid() = author_id);

CREATE POLICY "Users can create their own classes" 
ON public.classes 
FOR INSERT 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own classes" 
ON public.classes 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own classes" 
ON public.classes 
FOR DELETE 
USING (auth.uid() = author_id);

-- Criar trigger para atualização automática do updated_at
CREATE TRIGGER update_classes_updated_at
BEFORE UPDATE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar tabela exam_corrections para salvar correções com nota
CREATE TABLE IF NOT EXISTS public.exam_corrections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL,
  student_id uuid REFERENCES public.students(id),
  student_name text,
  student_identification text,
  answers jsonb NOT NULL DEFAULT '{}',
  score numeric NOT NULL DEFAULT 0.00,
  max_score numeric NOT NULL DEFAULT 0.00,
  percentage numeric NOT NULL DEFAULT 0.00,
  correction_date timestamp with time zone NOT NULL DEFAULT now(),
  qr_code_data text,
  image_url text,
  auto_corrected boolean DEFAULT true,
  author_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS na tabela exam_corrections
ALTER TABLE public.exam_corrections ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para exam_corrections
CREATE POLICY "Users can view their exam corrections" 
ON public.exam_corrections 
FOR SELECT 
USING (auth.uid() = author_id);

CREATE POLICY "Users can create exam corrections" 
ON public.exam_corrections 
FOR INSERT 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their exam corrections" 
ON public.exam_corrections 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their exam corrections" 
ON public.exam_corrections 
FOR DELETE 
USING (auth.uid() = author_id);

-- Criar trigger para atualização automática do updated_at
CREATE TRIGGER update_exam_corrections_updated_at
BEFORE UPDATE ON public.exam_corrections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();