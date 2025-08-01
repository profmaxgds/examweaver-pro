-- Adicionar coluna text_lines na tabela questions se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'questions' AND column_name = 'text_lines') THEN
    ALTER TABLE public.questions ADD COLUMN text_lines integer DEFAULT NULL;
  END IF;
END $$;

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

-- Criar políticas RLS para exam_corrections se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_corrections' AND policyname = 'Users can view their exam corrections') THEN
    CREATE POLICY "Users can view their exam corrections" 
    ON public.exam_corrections 
    FOR SELECT 
    USING (auth.uid() = author_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_corrections' AND policyname = 'Users can create exam corrections') THEN
    CREATE POLICY "Users can create exam corrections" 
    ON public.exam_corrections 
    FOR INSERT 
    WITH CHECK (auth.uid() = author_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_corrections' AND policyname = 'Users can update their exam corrections') THEN
    CREATE POLICY "Users can update their exam corrections" 
    ON public.exam_corrections 
    FOR UPDATE 
    USING (auth.uid() = author_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_corrections' AND policyname = 'Users can delete their exam corrections') THEN
    CREATE POLICY "Users can delete their exam corrections" 
    ON public.exam_corrections 
    FOR DELETE 
    USING (auth.uid() = author_id);
  END IF;
END $$;

-- Criar trigger para atualização automática do updated_at se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_exam_corrections_updated_at') THEN
    CREATE TRIGGER update_exam_corrections_updated_at
    BEFORE UPDATE ON public.exam_corrections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;