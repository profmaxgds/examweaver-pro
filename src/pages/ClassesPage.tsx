// src/pages/ClassesPage.tsx

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Search, BookCopy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ActionButtons } from '@/components/ActionButtons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ClassForm } from '@/components/ClassForm';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// Interface para os dados da turma com a instituição aninhada
interface ClassWithInstitution {
  id: string;
  name: string | null;
  description: string | null;
  year: number | null;
  semester: number | null;
  institution_header_id: string | null;
  created_at: string;
  updated_at: string;
  exam_headers: {
    institution: string | null;
  } | null;
}

export default function ClassesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [classes, setClasses] = useState<ClassWithInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClassDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithInstitution | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchClasses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('author_id', user.id)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      
      // Buscar cabeçalhos separadamente para cada turma
      const classesWithInstitution = await Promise.all((data || []).map(async (cls) => {
        if (cls.institution_header_id) {
          const { data: header } = await supabase
            .from('exam_headers')
            .select('institution')
            .eq('id', cls.institution_header_id)
            .single();
          return { ...cls, exam_headers: header };
        }
        return { ...cls, exam_headers: null };
      }));
      
      setClasses(classesWithInstitution as ClassWithInstitution[]);
    } catch (error) {
      console.error('Erro ao buscar turmas:', error);
      toast({
        title: 'Erro de Conexão',
        description: 'Não foi possível carregar as turmas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchClasses();
    }
  }, [user]);

  const handleSaveClass = async (formData: Partial<ClassWithInstitution>) => {
    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        author_id: user!.id,
        name: formData.name || 'Nome não informado'
      };

      // Remove o objeto aninhado que não pertence à tabela 'classes'
      delete (dataToSave as any).exam_headers; 

      const { error } = editingClass
        ? await supabase.from('classes').update(dataToSave).eq('id', editingClass.id)
        : await supabase.from('classes').insert(dataToSave);
      
      if (error) throw new Error(error.message);
      
      toast({ title: 'Sucesso!', description: `Turma ${editingClass ? 'atualizada' : 'cadastrada'} com sucesso.` });
      setClassDialogOpen(false);
      setEditingClass(null);
      await fetchClasses();
    } catch (error) {
      console.error('Erro ao salvar turma:', error);
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar a turma.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      const { error } = await supabase.from('classes').delete().eq('id', classId);
      if (error) throw new Error(error.message);
      toast({ title: 'Sucesso!', description: 'Turma excluída.' });
      await fetchClasses();
    } catch (error) {
      console.error('Erro ao excluir turma:', error);
      toast({ title: 'Erro', description: 'Não foi possível excluir a turma.', variant: 'destructive' });
    }
  };

  const openClassDialog = (classData: ClassWithInstitution | null = null) => {
    setEditingClass(classData);
    setClassDialogOpen(true);
  };

  const filteredClasses = useMemo(() => {
    return classes.filter(c =>
      (c.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (c.exam_headers?.institution?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [classes, searchTerm]);

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link to="/">
                  <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Home</Button>
                </Link>
                <h1 className="text-2xl font-bold">Gerenciar Turmas</h1>
              </div>
              <div className="flex items-center space-x-2">
                 <Link to="/students">
                  <Button variant="outline">Alunos</Button>
                </Link>
                <Button onClick={() => openClassDialog()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Turma
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Turmas</CardTitle>
              <CardDescription>Edite, exclua e gerencie todas as suas turmas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 max-w-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou instituição..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
              </div>
              
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Carregando turmas...</div>
              ) : filteredClasses.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <BookCopy className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhuma turma encontrada</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Você ainda não cadastrou nenhuma turma.</p>
                  <Button className="mt-4" onClick={() => openClassDialog()}><Plus className="mr-2 h-4 w-4" />Cadastrar Turma</Button>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome da Turma</TableHead>
                        <TableHead>Ano</TableHead>
                        <TableHead>Semestre</TableHead>
                        <TableHead>Instituição</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClasses.map((classData) => (
                        <TableRow key={classData.id}>
                          <TableCell className="font-medium">{classData.name || 'N/A'}</TableCell>
                          <TableCell>{classData.year || 'N/A'}</TableCell>
                          <TableCell>{classData.semester || 'N/A'}</TableCell>
                          <TableCell>{classData.exam_headers?.institution || 'Não especificada'}</TableCell>
                          <TableCell className="text-right">
                            <ActionButtons
                              entityName="turma"
                              onEdit={() => openClassDialog(classData)}
                              onDelete={() => handleDeleteClass(classData.id)}
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

      <Dialog open={isClassDialogOpen} onOpenChange={setClassDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClass ? 'Editar Turma' : 'Cadastrar Nova Turma'}</DialogTitle>
            <DialogDescription>Preencha as informações para gerenciar a turma.</DialogDescription>
          </DialogHeader>
          <ClassForm
            loading={loading}
            onSave={handleSaveClass}
            onCancel={() => { setClassDialogOpen(false); setEditingClass(null); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}