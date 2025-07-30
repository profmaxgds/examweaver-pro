-- Adicionar colunas ao exams para novas funcionalidades
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS header_id UUID;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS qr_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS correction_template JSONB;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS grade_scale JSONB DEFAULT '{"total": 100, "passing": 60}';
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS time_limit INTEGER; -- em minutos

-- Atualizar tabela corrections para OCR
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS ocr_data JSONB;
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS auto_corrected BOOLEAN DEFAULT false;
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS manual_review BOOLEAN DEFAULT false;
ALTER TABLE public.corrections ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exam_headers_author_id ON public.exam_headers(author_id);
CREATE INDEX IF NOT EXISTS idx_exam_headers_institution ON public.exam_headers(institution);
CREATE INDEX IF NOT EXISTS idx_reports_author_id ON public.reports(author_id);
CREATE INDEX IF NOT EXISTS idx_reports_exam_id ON public.reports(exam_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_author_id ON public.file_uploads(author_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_entity ON public.file_uploads(entity_type, entity_id);