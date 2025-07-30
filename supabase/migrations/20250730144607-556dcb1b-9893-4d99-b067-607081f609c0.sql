-- Adicionar tabela para cabeçalhos de provas personalizados
CREATE TABLE public.exam_headers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  logo_url TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exam_headers ENABLE ROW LEVEL SECURITY;

-- Create policies for exam headers
CREATE POLICY "Users can view their own exam headers" 
ON public.exam_headers 
FOR SELECT 
USING (auth.uid() = author_id);

CREATE POLICY "Users can create their own exam headers" 
ON public.exam_headers 
FOR INSERT 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own exam headers" 
ON public.exam_headers 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own exam headers" 
ON public.exam_headers 
FOR DELETE 
USING (auth.uid() = author_id);

-- Trigger for timestamps
CREATE TRIGGER update_exam_headers_updated_at
BEFORE UPDATE ON public.exam_headers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();