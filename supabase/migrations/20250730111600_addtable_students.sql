-- Tabela para armazenar dados dos alunos
CREATE TABLE public.alunos (
  -- Colunas de Identificação e Vínculos
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL, -- Prova associada a este registro de nota/aluno

  -- Informações Pessoais do Aluno
  matricula TEXT,
  nome TEXT NOT NULL,
  email TEXT,

  -- Informações Acadêmicas
  instituicao TEXT,
  curso TEXT,
  turma TEXT,

  -- Informações de Desempenho
  nota_obtida DECIMAL(5, 2) CHECK (nota_obtida >= 0),

  -- Timestamps de Controle
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Garante que um aluno não pode ter um registro duplicado para a mesma prova, turma e instituição
  CONSTRAINT aluno_prova_unica_constraint UNIQUE (author_id, matricula, exam_id, turma, instituicao)
);

-- Habilita a Segurança a Nível de Linha (RLS)
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso (RLS Policies)
-- Garante que os usuários só possam interagir com os seus próprios dados de alunos.

CREATE POLICY "Usuários podem ver seus próprios alunos"
ON public.alunos
FOR SELECT USING (auth.uid() = author_id);

CREATE POLICY "Usuários podem cadastrar seus próprios alunos"
ON public.alunos
FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Usuários podem atualizar seus próprios alunos"
ON public.alunos
FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Usuários podem remover seus próprios alunos"
ON public.alunos
FOR DELETE USING (auth.uid() = author_id);

-- Índices para Melhorar a Performance de Consultas
CREATE INDEX idx_alunos_author_id ON public.alunos(author_id);
CREATE INDEX idx_alunos_exam_id ON public.alunos(exam_id);
CREATE INDEX idx_alunos_matricula ON public.alunos(matricula);
CREATE INDEX idx_alunos_email ON public.alunos(email);

-- Trigger para atualizar a coluna 'updated_at' automaticamente
CREATE TRIGGER update_alunos_updated_at
BEFORE UPDATE ON public.alunos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();