// src/pages/StudentsPage.tsx

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Upload, Users, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ActionButtons } from '@/components/ActionButtons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StudentForm } from '@/components/StudentForm';
import { ClassForm } from '@/components/ClassForm';
import { ImportStudentsWizard } from '@/components/ImportStudentsWizard';
import { fetchStudents, Student } from '@/utils/supabaseQueries';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      fetchClasses();
      fetchStudents(user.id, selectedClass, setStudents, setLoading);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchStudents(user.id, selectedClass, setStudents, setLoading);
      setSelectedStudents([]);
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, year, semester')
        .eq('author_id', user.id)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      if (data) {
        setClasses(data);
      }
    } catch (error) {
      console.error('Erro ao buscar turmas:', error);
      toast({
        title: 'Erro de Conexão',
        description: 'Não foi possível carregar as turmas para o filtro.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveStudent = async (formData: Partial<Student>, studentId?: string) => {
    setLoading(true);
    try {
      const dataToSave = { 
        ...formData, 
        author_id: user!.id,
        name: formData.name || 'Nome não informado'
      };
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
        .insert({ 
          ...formData, 
          author_id: user!.id,
          name: formData.name || 'Nome não informado'
        });
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
  
  const handleGoToCreateClass = () => {
    setImportDialogOpen(false);
    setClassDialogOpen(true);
  };

  const handleDeleteSelected = async () => {
    if (selectedStudents.length === 0) return;
    try {
      const { error } = await supabase.from('students').delete().in('id', selectedStudents);
      if (error) throw new Error(error.message);
      
      toast({ title: 'Sucesso!', description: `${selectedStudents.length} aluno(s) excluído(s).` });
      setSelectedStudents([]);
      await fetchStudents(user!.id, selectedClass, setStudents, setLoading);
    } catch (error) {
      console.error('Erro ao excluir alunos:', error);
      toast({ title: 'Erro', description: 'Não foi possível excluir os alunos selecionados.', variant: 'destructive' });
    }
  };
  
  const filteredStudents = useMemo(() => {
    return students.filter(student =>
      (student.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (student.student_id?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [students, searchTerm]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(filteredStudents.map(s => s.id));
    } else {
      setSelectedStudents([]);
    }
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
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <Select value={selectedClass} onValueChange={setSelectedClass} disabled={loading}>
                    <SelectTrigger className="w-full sm:w-[240px]">
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
                  <div className="relative w-full sm:w-[240px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar por nome ou matrícula..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                </div>
                {selectedStudents.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full sm:w-auto">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir ({selectedStudents.length})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir {selectedStudents.length} aluno(s)? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSelected}>Confirmar Exclusão</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={selectedStudents.length > 0 && selectedStudents.length === filteredStudents.length}
                            onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                          />
                        </TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Curso</TableHead>
                        <TableHead>Instituição</TableHead>
                        <TableHead>Turma</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student) => (
                        <TableRow key={student.id} data-state={selectedStudents.includes(student.id) ? "selected" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={selectedStudents.includes(student.id)}
                              onCheckedChange={(checked) => {
                                setSelectedStudents(prev => 
                                  checked ? [...prev, student.id] : prev.filter(id => id !== student.id)
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{student.name || 'N/A'}</TableCell>
                          <TableCell>{student.student_id || 'N/A'}</TableCell>
                          <TableCell>{student.course || 'N/A'}</TableCell>
                          <TableCell>{student.exam_headers?.institution || 'N/A'}</TableCell>
                          <TableCell>{student.classes?.name || 'Sem turma'}</TableCell>
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
            initialData={editingStudent ? { ...editingStudent, institution_header_id: editingStudent.institution_header_id || '' } : undefined}
            onSave={handleSaveStudent}
            onCancel={() => { setStudentDialogOpen(false); setEditingStudent(null); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isClassDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Nova Turma</DialogTitle>
            <DialogDescription>Preencha as informações para criar uma nova turma.</DialogDescription>
          </DialogHeader>
          <ClassForm loading={loading} onSave={handleSaveClass} onCancel={() => setClassDialogOpen(false)} />
        </DialogContent>
      </Dialog>
      
      <ImportStudentsWizard
        isOpen={isImportDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={() => fetchStudents(user!.id, selectedClass, setStudents, setLoading)}
        onGoToCreateClass={handleGoToCreateClass}
      />
    </>
  );
}