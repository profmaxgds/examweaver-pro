// src/pages/Dashboard.tsx

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, FileText, PlusCircle, BarChart3, Upload, LogOut, ClipboardList, BookCopy, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStats {
  questions: number;
  exams: number;
  corrections: number;
}

interface Exam {
  id: string;
  title: string;
  subject: string;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({ questions: 0, exams: 0, corrections: 0 });
  const [lastExam, setLastExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;

      try {
        const [questionsRes, examsRes, correctionsRes, lastExamRes] = await Promise.all([
          supabase.from('questions').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
          supabase.from('exams').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
          supabase.from('corrections').select('id', { count: 'exact', head: true }),
          supabase.from('exams').select('id, title, subject').eq('author_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        ]);

        setStats({
          questions: questionsRes.count || 0,
          exams: examsRes.count || 0,
          corrections: correctionsRes.count || 0,
        });

        if (lastExamRes.data) {
          setLastExam(lastExamRes.data);
        }

      } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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
              <Button variant="outline" onClick={signOut}><LogOut className="w-4 h-4 mr-2" />Sair</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Estatísticas Navegáveis */}
          <div className="grid gap-4 md:grid-cols-3">
            <Link to="/questions">
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total de Questões</CardTitle><BookOpen className="h-4 w-4 text-muted-foreground" /></CardHeader>
                <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-12" /> : stats.questions}</div><p className="text-xs text-muted-foreground">No seu banco de questões</p></CardContent>
              </Card>
            </Link>
            <Link to="/exams">
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Provas Criadas</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader>
                <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-12" /> : stats.exams}</div><p className="text-xs text-muted-foreground">Provas disponíveis</p></CardContent>
              </Card>
            </Link>
            <Link to="/reports">
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Correções Realizadas</CardTitle><BarChart3 className="h-4 w-4 text-muted-foreground" /></CardHeader>
                <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-12" /> : stats.corrections}</div><p className="text-xs text-muted-foreground">Total de provas corrigidas</p></CardContent>
              </Card>
            </Link>
          </div>

          {/* Ações Rápidas */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Link to="/questions/new"><Card className="h-full hover:shadow-md transition-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><PlusCircle /> Nova Questão</CardTitle></CardHeader><CardContent><CardDescription>Adicionar uma nova questão ao seu banco de dados.</CardDescription></CardContent></Card></Link>
            <Link to="/exams/new"><Card className="h-full hover:shadow-md transition-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><FileText /> Nova Prova</CardTitle></CardHeader><CardContent><CardDescription>Montar uma nova prova usando suas questões.</CardDescription></CardContent></Card></Link>
            <Link to="/students"><Card className="h-full hover:shadow-md transition-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><Users /> Gerenciar Alunos</CardTitle></CardHeader><CardContent><CardDescription>Adicionar e editar alunos para suas turmas.</CardDescription></CardContent></Card></Link>
            
            {/* NOVO CARD ADICIONADO AQUI */}
            <Link to="/classes"><Card className="h-full hover:shadow-md transition-shadow"><CardHeader><CardTitle className="flex items-center gap-2"><BookCopy /> Gerenciar Turmas</CardTitle></CardHeader><CardContent><CardDescription>Criar e editar suas turmas e instituições.</CardDescription></CardContent></Card></Link>
          </div>

          {/* Pré-visualização da Última Prova MELHORADA */}
          <Card>
            <CardHeader>
              <CardTitle>Última Prova Criada</CardTitle>
              <CardDescription>
                {loading ? <Skeleton className="h-4 w-1/2 mt-1" /> : (lastExam ? "Abaixo está um resumo da sua prova mais recente." : "Nenhuma prova criada ainda.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="w-full h-24" /> : lastExam ? (
                <div className="border rounded-md p-4 bg-muted/20 space-y-2">
                    <h3 className="font-semibold text-lg">{lastExam.title}</h3>
                    <p className="text-sm text-muted-foreground">{lastExam.subject}</p>
                    <Link to={`/exams/${lastExam.id}/edit`}>
                        <Button variant="outline" size="sm" className="mt-2">Ver Detalhes</Button>
                    </Link>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Crie sua primeira prova para ver os detalhes aqui.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}