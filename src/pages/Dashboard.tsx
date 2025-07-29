import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, FileText, PlusCircle, Settings, BarChart3, Upload } from 'lucide-react';

interface DashboardStats {
  questions: number;
  exams: number;
  corrections: number;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({ questions: 0, exams: 0, corrections: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      try {
        const [questionsRes, examsRes, correctionsRes] = await Promise.all([
          supabase.from('questions').select('id', { count: 'exact' }).eq('author_id', user.id),
          supabase.from('exams').select('id', { count: 'exact' }).eq('author_id', user.id),
          supabase
            .from('corrections')
            .select('id', { count: 'exact' })
            .in('exam_id', 
              (await supabase.from('exams').select('id').eq('author_id', user.id)).data?.map(e => e.id) || []
            )
        ]);

        setStats({
          questions: questionsRes.count || 0,
          exams: examsRes.count || 0,
          corrections: correctionsRes.count || 0,
        });
      } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold">ExamCraft</h1>
              <Badge variant="outline">Professor</Badge>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Button variant="outline" onClick={signOut}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Estatísticas */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Questões</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? '...' : stats.questions}</div>
                <p className="text-xs text-muted-foreground">
                  No seu banco de questões
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Provas Criadas</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? '...' : stats.exams}</div>
                <p className="text-xs text-muted-foreground">
                  Provas disponíveis
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Correções Realizadas</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? '...' : stats.corrections}</div>
                <p className="text-xs text-muted-foreground">
                  Provas corrigidas
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Ações Rápidas */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/questions/new">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-2">
                    <PlusCircle className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Nova Questão</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Criar uma nova questão para o seu banco
                  </CardDescription>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/questions">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Banco de Questões</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Gerenciar suas questões existentes
                  </CardDescription>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/exams/new">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Nova Prova</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Criar uma nova prova com suas questões
                  </CardDescription>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to="/corrections">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-2">
                    <Upload className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Correção Automática</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Escanear e corrigir provas automaticamente
                  </CardDescription>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Provas Recentes */}
          <Card>
            <CardHeader>
              <CardTitle>Atividade Recente</CardTitle>
              <CardDescription>
                Suas últimas provas e correções
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Nenhuma atividade recente</p>
                    <p className="text-sm text-muted-foreground">
                      Comece criando sua primeira questão ou prova
                    </p>
                  </div>
                  <Link to="/questions/new">
                    <Button>Começar</Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}