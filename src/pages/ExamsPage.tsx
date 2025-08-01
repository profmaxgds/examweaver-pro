import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, FileText, Edit, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

interface Exam {
  id: string;
  title: string;
  subject: string;
  institution: string | null;
  exam_date: string | null;
  question_ids: string[];
  total_points: number;
  versions: number;
  created_at: string;
}

export default function ExamsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchExams();
  }, [user]);

  const fetchExams = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        setExams(data.map(exam => ({ ...exam, institution: exam.institutions || '' })));
      }
    } catch (error) {
      console.error('Erro ao buscar provas:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as provas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteExam = async (id: string) => {
    try {
      const { error } = await supabase.from('exams').delete().eq('id', id);
      if (error) throw error;
      setExams(prev => prev.filter(exam => exam.id !== id));
      toast({
        title: "Sucesso",
        description: "Prova excluída com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao excluir prova:', error);
      toast({
        title: "Erro",
        description: `Não foi possível excluir a prova: ${error.message}`,
        variant: "destructive",
      });
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Provas</h1>
            </div>
            <Link to="/exams/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Prova
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-8"><p>Carregando provas...</p></div>
        ) : exams.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                Você ainda não tem provas criadas.
              </p>
              <Link to="/exams/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Primeira Prova
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {exams.map((exam) => (
              <Card key={exam.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/exams/${exam.id}/edit`)}>
                      <h3 className="text-lg font-semibold mb-2">{exam.title}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="secondary">{exam.subject}</Badge>
                        {exam.institution && <Badge variant="outline">{exam.institution}</Badge>}
                        <Badge variant="outline">{exam.question_ids.length} questões</Badge>
                        <Badge variant="outline">{exam.total_points} pontos</Badge>
                        {exam.versions > 1 && <Badge variant="outline">{exam.versions} versões</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Criada em {new Date(exam.created_at).toLocaleDateString('pt-BR')}
                        {exam.exam_date && ` • Prova em: ${new Date(exam.exam_date).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Link to={`/exams/${exam.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Essa ação não pode ser desfeita. Isso excluirá permanentemente a prova e todos os seus dados associados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteExam(exam.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}