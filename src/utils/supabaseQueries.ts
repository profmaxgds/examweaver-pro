import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// Interface para os dados do aluno, alinhada com a tabela students
export interface Student {
  id: string;
  student_id: string | null;
  name: string | null;
  email: string | null;
  course: string | null;
  grade: number | null;
  class_id: string | null;
  institution_header_id: string | null;
  exam_id: string | null;
  created_at: string;
  updated_at: string;
  classes: {
    id: string;
    name: string | null;
    description: string | null;
    year: number | null;
    semester: number | null;
    institution_header_id: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  exam_headers: {
    id: string;
    name: string | null;
    institution: string | null;
    logo_url: string | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
  } | null;
}

// Interface para turmas, alinhada com a tabela classes
export interface Class {
  id: string;
  name: string | null;
  description: string | null;
  year: number | null;
  semester: number | null;
  institution_header_id: string | null;
  created_at: string;
  updated_at: string;
}

export const fetchStudents = async (
  userId: string | undefined,
  selectedClass: string,
  setStudents: (students: Student[]) => void,
  setLoading: (loading: boolean) => void
) => {
  if (!userId) {
    console.error('Usuário não autenticado');
    toast({
      title: 'Erro de Autenticação',
      description: 'Usuário não está autenticado. Faça login novamente.',
      variant: 'destructive',
    });
    setStudents([]);
    setLoading(false);
    return;
  }

  setLoading(true);

  try {
    let query = supabase
      .from('students')
      .select(`
        id,
        student_id,
        name,
        email,
        course,
        grade,
        class_id,
        institution_header_id,
        exam_id,
        created_at,
        updated_at,
        classes:classes!students_class_id_fkey (id, name, description, year, semester, institution_header_id, created_at, updated_at),
        exam_headers:exam_headers!students_institution_header_id_fkey (id, name, institution, logo_url, is_default, created_at, updated_at)
      `)
      .eq('author_id', userId);

    if (selectedClass !== 'all') {
      query = query.eq('class_id', selectedClass);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) throw new Error(error.message);
    setStudents(data || []);
  } catch (error) {
    console.error('Erro ao carregar alunos:', error);
    toast({
      title: 'Erro de Conexão',
      description: 'Não foi possível carregar os alunos. Verifique sua conexão ou permissões.',
      variant: 'destructive',
    });
    setStudents([]);
  } finally {
    setLoading(false);
  }
};

export const fetchClasses = async (
  userId: string | undefined,
  setClasses: (classes: Class[]) => void
) => {
  if (!userId) {
    console.error('Usuário não autenticado');
    toast({
      title: 'Erro de Autenticação',
      description: 'Usuário não está autenticado. Faça login novamente.',
      variant: 'destructive',
    });
    setClasses([]);
    return;
  }

  try {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, description, year, semester, institution_header_id, created_at, updated_at')
      .eq('author_id', userId)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    setClasses(data || []);
  } catch (error) {
    console.error('Erro ao buscar turmas:', error);
    toast({
      title: 'Erro de Conexão',
      description: 'Não foi possível carregar as turmas. Verifique sua conexão ou permissões.',
      variant: 'destructive',
    });
    setClasses([]);
  }
};