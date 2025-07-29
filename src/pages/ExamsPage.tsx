import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, FileText, Download, QrCode } from 'lucide-react';
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

  useEffect(() => {
    fetchExams();
  }, [user]);

  const fetchExams = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExams(data || []);
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

  return (
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
          <div className="text-center py-8">
            <p>Carregando provas...</p>
          </div>
        ) : exams.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
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
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">{exam.title}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="secondary">{exam.subject}</Badge>
                        {exam.institution && (
                          <Badge variant="outline">{exam.institution}</Badge>
                        )}
                        <Badge variant="outline">{exam.question_ids.length} questões</Badge>
                        <Badge variant="outline">{exam.total_points} pontos</Badge>
                        {exam.versions > 1 && (
                          <Badge variant="outline">{exam.versions} versões</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Criada em {new Date(exam.created_at).toLocaleDateString('pt-BR')}
                        {exam.exam_date && (
                          <> • Data da prova: {new Date(exam.exam_date).toLocaleDateString('pt-BR')}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Button variant="outline" size="sm">
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <QrCode className="w-4 h-4" />
                      </Button>
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