-- Create custom types
CREATE TYPE public.question_type AS ENUM ('multiple_choice', 'true_false', 'essay', 'fill_blanks');
CREATE TYPE public.difficulty_level AS ENUM ('easy', 'medium', 'hard', 'custom');
CREATE TYPE public.correction_status AS ENUM ('pending', 'completed', 'pending_review');

-- Create profiles table for additional user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT,
  subjects TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create questions table
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB NOT NULL, -- enunciado, imagens, fórmulas
  type question_type NOT NULL DEFAULT 'multiple_choice',
  options JSONB, -- alternativas para múltipla escolha
  correct_answer JSONB NOT NULL, -- resposta(s) correta(s)
  category TEXT,
  subject TEXT NOT NULL,
  institution TEXT,
  difficulty difficulty_level NOT NULL DEFAULT 'medium',
  tags TEXT[],
  points DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  language TEXT DEFAULT 'pt',
  image_urls TEXT[],
  audio_urls TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for questions
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Create policies for questions
CREATE POLICY "Users can view their own questions" 
ON public.questions 
FOR SELECT 
USING (auth.uid() = author_id);

CREATE POLICY "Users can create their own questions" 
ON public.questions 
FOR INSERT 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own questions" 
ON public.questions 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own questions" 
ON public.questions 
FOR DELETE 
USING (auth.uid() = author_id);

-- Create exams table
CREATE TABLE public.exams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  institution TEXT,
  exam_date TIMESTAMP WITH TIME ZONE,
  question_ids UUID[] NOT NULL,
  total_points DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  layout TEXT DEFAULT 'single_column',
  header JSONB, -- logomarca, curso, turno, etc
  students JSONB, -- lista de alunos
  shuffle_questions BOOLEAN DEFAULT false,
  shuffle_options BOOLEAN DEFAULT false,
  versions INTEGER DEFAULT 1,
  answer_sheet JSONB, -- configurações do gabarito
  qr_code_data TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for exams
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

-- Create policies for exams
CREATE POLICY "Users can view their own exams" 
ON public.exams 
FOR SELECT 
USING (auth.uid() = author_id);

CREATE POLICY "Users can create their own exams" 
ON public.exams 
FOR INSERT 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own exams" 
ON public.exams 
FOR UPDATE 
USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their own exams" 
ON public.exams 
FOR DELETE 
USING (auth.uid() = author_id);

-- Create corrections table
CREATE TABLE public.corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id TEXT, -- matrícula ou ID
  student_name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  answers JSONB NOT NULL, -- respostas do aluno
  score DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  image_url TEXT, -- imagem escaneada
  status correction_status DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for corrections
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

-- Create policies for corrections (users can see corrections of their exams)
CREATE POLICY "Users can view corrections of their exams" 
ON public.corrections 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.exams 
    WHERE exams.id = corrections.exam_id 
    AND exams.author_id = auth.uid()
  )
);

CREATE POLICY "Users can create corrections for their exams" 
ON public.corrections 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exams 
    WHERE exams.id = corrections.exam_id 
    AND exams.author_id = auth.uid()
  )
);

CREATE POLICY "Users can update corrections of their exams" 
ON public.corrections 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.exams 
    WHERE exams.id = corrections.exam_id 
    AND exams.author_id = auth.uid()
  )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_corrections_updated_at
  BEFORE UPDATE ON public.corrections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_questions_author_id ON public.questions(author_id);
CREATE INDEX idx_questions_subject ON public.questions(subject);
CREATE INDEX idx_questions_category ON public.questions(category);
CREATE INDEX idx_questions_tags ON public.questions USING GIN(tags);
CREATE INDEX idx_exams_author_id ON public.exams(author_id);
CREATE INDEX idx_corrections_exam_id ON public.corrections(exam_id);

-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('question-images', 'question-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('question-audio', 'question-audio', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('exam-logos', 'exam-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('correction-scans', 'correction-scans', false);

-- Create storage policies
CREATE POLICY "Users can upload their own question images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'question-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Question images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'question-images');

CREATE POLICY "Users can upload their own question audio" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'question-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Question audio is publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'question-audio');

CREATE POLICY "Users can upload their own exam logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'exam-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Exam logos are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'exam-logos');

CREATE POLICY "Users can upload correction scans" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'correction-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own correction scans" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'correction-scans' AND auth.uid()::text = (storage.foldername(name))[1]);