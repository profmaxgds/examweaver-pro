import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Upload, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ActionButtons } from '@/components/ActionButtons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StudentForm } from '@/components/StudentForm';
import { ClassForm } from '@/components/ClassForm';
import { ImportStudentsDialog } from '@/components/ImportStudentsDialog';
import { fetchStudents, Student } from '@/utils/supabaseQueries';

// Interface para turmas, alinhada com a tabela classes
interface Class {
  id: string;
  name: string | null;
  description: string | null;
  year: number | null;
  semester: number | null;
  institution_header_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function StudentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [isStudentDialogOpen, setStudentDialogOpen] = useState(false);
  const [isClassDialogOpen, setClassDialogOpen] = useState(false);
  const [isImportDialogOpen, setImportDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (user) {
      fetchClasses();
      fetchStudents(user.id, selectedClass, setStudents, setLoading);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchStudents(user.id, selectedClass, setStudents, setLoading);
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, description, year, semester, institution_header_id, created_at, updated_at')
        .eq('author_id', user.id)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      setClasses(data || []);
    } catch (error) {
      console.error('Erro ao buscar turmas:', error);
      toast({
        title: 'Erro de Conexão',
        description: 'Não foi possível carregar as turmas. Verifique sua conexão.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveStudent = async (formData: Partial<Student>, studentId?: string) => {
    setLoading(true);
    try {
      const dataToSave = { ...formData, author_id: user!.id };
      const { error } = studentId
        ? await supabase.from('students').update(dataToSave).eq('id', studentId)
        : await supabase.from('students').insert(dataToSave);

      if (error) throw new Error(error.message);
      toast({
        title: 'Sucesso!',
        description: `Aluno ${studentId ? 'atualizado' : 'cadastrado'} com sucesso.`,
      });
      setStudentDialogOpen(false);
      setEditingStudent(null);
      await fetchStudents(user!.id, selectedClass, setStudents, setLoading);
    } catch (error) {
      console.error('Erro ao salvar aluno:', error);
      toast({
        title: 'Erro ao salvar aluno',
        description: 'Não foi possível salvar o aluno. Verifique os dados e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw new Error(error.message);
      toast({ title: 'Sucesso!', description: 'Aluno excluído.' });
      await fetchStudents(user!.id, selectedClass, setStudents, setLoading);
    } catch (error) {
      console.error('Erro ao excluir aluno:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o aluno.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveClass = async (formData: Partial<Class>) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('classes')
        .insert({ ...formData, author_id: user!.id });
      if (error) throw new Error(error.message);
      toast({ title: 'Sucesso!', description: 'Turma cadastrada com sucesso.' });
      setClassDialogOpen(false);
      await fetchClasses();
    } catch (error) {
      console.error('Erro ao salvar turma:', error);
      toast({
        title: 'Erro ao salvar turma',
        description: 'Não foi possível salvar a turma. Verifique os dados e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openStudentDialog = (student: Student | null = null) => {
    setEditingStudent(student);
    setStudentDialogOpen(true);
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link to="/">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
                <h1 className="text-2xl font-bold">Alunos e Turmas</h1>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Importar Alunos
                </Button>
                <Button onClick={() => setClassDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Turma
                </Button>
                <Button onClick={() => openStudentDialog()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Aluno
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Alunos</CardTitle>
              <CardDescription>Gerencie seus alunos e filtre por turma.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 max-w-xs">
                <Select value={selectedClass} onValueChange={setSelectedClass} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por turma..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Turmas</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name || 'Sem nome'} {c.year && c.semester ? `(${c.year}/${c.semester})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando alunos...</div>
              ) : students.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhum aluno encontrado</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedClass === 'all'
                      ? 'Você ainda não cadastrou nenhum aluno.'
                      : 'Nenhum aluno encontrado para esta turma.'}
                  </p>
                  <Button className="mt-4" onClick={() => openStudentDialog()}>
                    <Plus className="mr-2 h-4 w-4" /> Cadastrar Aluno
                  </Button>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Curso</TableHead>
                        <TableHead>Nota</TableHead>
                        <TableHead>Instituição</TableHead>
                        <TableHead>Turma</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.name || 'N/A'}</TableCell>
                          <TableCell>{student.student_id || 'N/A'}</TableCell>
                          <TableCell>{student.course || 'N/A'}</TableCell>
                          <TableCell>{student.grade != null ? student.grade : 'N/A'}</TableCell>
                          <TableCell>{student.exam_headers?.institution || 'N/A'}</TableCell>
                          <TableCell>
                            {student.classes?.name
                              ? `${student.classes.name} ${
                                  student.classes.year && student.classes.semester
                                    ? `(${student.classes.year}/${student.classes.semester})`
                                    : ''
                                }`
                              : 'Sem turma'}
                          </TableCell>
                          <TableCell className="text-right">
                            <ActionButtons
                              entityName="aluno"
                              onEdit={() => openStudentDialog(student)}
                              onDelete={() => handleDeleteStudent(student.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={isStudentDialogOpen} onOpenChange={setStudentDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'Editar Aluno' : 'Cadastrar Novo Aluno'}</DialogTitle>
            <DialogDescription>Preencha as informações abaixo para gerenciar o aluno.</DialogDescription>
          </DialogHeader>
          <StudentForm
            loading={loading}
            initialData={
              editingStudent
                ? { ...editingStudent, institution_header_id: editingStudent.institution_header_id || '' }
                : undefined
            }
            onSave={handleSaveStudent}
            onCancel={() => {
              setStudentDialogOpen(false);
              setEditingStudent(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isClassDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Turma</DialogTitle>
            <DialogDescription>Preencha as informações para criar uma nova turma.</DialogDescription>
          </DialogHeader>
          <ClassForm
            loading={loading}
            onSave={handleSaveClass}
            onCancel={() => setClassDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ImportStudentsDialog
        isOpen={isImportDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={() => fetchStudents(user!.id, selectedClass, setStudents, setLoading)}
      />
    </>
  );
}