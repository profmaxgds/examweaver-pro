// src/pages/Home.tsx

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, FileText, PlusCircle, BarChart3, Upload, LogOut, ClipboardList, BookCopy, Users, User, CheckCircle, Target, Send, Camera, Shield, Smartphone, Zap, QrCode, ScanLine } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface HomeStats {
  questions: number;
  exams: number;
  corrections: number;
}

interface Exam {
  id: string;
  title: string;
  subject: string;
}

export default function Home() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRoles();
  const [stats, setStats] = useState<HomeStats>({ questions: 0, exams: 0, corrections: 0 });
  const [lastExam, setLastExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
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
        console.error('Erro ao buscar dados da home:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHomeData();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src="/logos/icone.png" alt="TestifyAI" className="w-8 h-8" />
              <h1 className="text-2xl font-bold">TestifyAI</h1>
              <Badge variant="outline">Professor</Badge>
              {isAdmin && (
                <Badge variant="default" className="gap-1">
                  <Shield className="w-3 h-3" />
                  Admin
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Shield className="w-4 h-4" />
                    Admin
                  </Button>
                </Link>
              )}
              <Link to="/profile">
                <Button variant="outline" size="sm">
                  <User className="w-4 h-4 mr-2" />
                  Perfil
                </Button>
              </Link>
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
                <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-12" /> : stats.questions}</div><div className="text-xs text-muted-foreground">No seu banco de questões</div></CardContent>
              </Card>
            </Link>
            <Link to="/exams">
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Provas Criadas</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader>
                <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-12" /> : stats.exams}</div><div className="text-xs text-muted-foreground">Provas disponíveis</div></CardContent>
              </Card>
            </Link>
            <Link to="/corrections-management">
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Correções Realizadas</CardTitle><BarChart3 className="h-4 w-4 text-muted-foreground" /></CardHeader>
                <CardContent><div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-12" /> : stats.corrections}</div><div className="text-xs text-muted-foreground">Total de provas corrigidas</div></CardContent>
              </Card>
            </Link>
           </div>

          {/* Seção de Destaque - Gestão de Gabaritos */}
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ClipboardList className="w-6 h-6 text-primary" />
                Sistema Tradicional de Correção
              </CardTitle>
              <CardDescription className="text-base">
                Métodos clássicos de correção com tecnologia OCR avançada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Link to="/auto-correction" className="no-underline">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Correção Automática</p>
                      <p className="text-xs text-muted-foreground">OCR + IA para detectar marcações</p>
                    </div>
                  </div>
                </Link>
                <Link to="/corrections-management" className="no-underline">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Target className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Correção Manual</p>
                      <p className="text-xs text-muted-foreground">Interface interativa tipo gabarito</p>
                    </div>
                  </div>
                </Link>
                <Link to="/reports" className="no-underline">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Estatísticas</p>
                      <p className="text-xs text-muted-foreground">Relatórios em tempo real</p>
                    </div>
                  </div>
                </Link>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/auto-correction" className="no-underline">
                  <Button variant="outline" className="gap-2 w-full">
                    <Camera className="w-4 h-4" />
                    Correção por Upload
                  </Button>
                </Link>
                <Link to="/corrections-management" className="no-underline">
                  <Button variant="outline" className="gap-2 w-full">
                    <ClipboardList className="w-4 h-4" />
                    Gestão Manual
                  </Button>
                </Link>
                <Link to="/reports" className="no-underline">
                  <Button variant="outline" className="gap-2 w-full">
                    <BarChart3 className="w-4 h-4" />
                    Relatórios
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Funcionalidades Principais Organizadas */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gestão de Conteúdo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Gestão de Conteúdo
                </CardTitle>
                <CardDescription>Crie e organize suas questões e provas</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Link to="/questions/new">
                  <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                    <CardContent className="flex items-center gap-3 pt-4">
                      <PlusCircle className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold">Nova Questão</p>
                        <p className="text-sm text-muted-foreground">Adicionar questão ao banco</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/exams/new">
                  <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                    <CardContent className="flex items-center gap-3 pt-4">
                      <FileText className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold">Nova Prova</p>
                        <p className="text-sm text-muted-foreground">Montar prova com questões</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/headers">
                  <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                    <CardContent className="flex items-center gap-3 pt-4">
                      <BookCopy className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold">Cabeçalhos</p>
                        <p className="text-sm text-muted-foreground">Configurar layout de provas</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </CardContent>
            </Card>

            {/* Gestão de Turmas */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Gestão de Turmas
                </CardTitle>
                <CardDescription>Organize alunos e turmas</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Link to="/students">
                  <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                    <CardContent className="flex items-center gap-3 pt-4">
                      <User className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold">Gerenciar Alunos</p>
                        <p className="text-sm text-muted-foreground">Adicionar e editar alunos</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/classes">
                  <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                    <CardContent className="flex items-center gap-3 pt-4">
                      <BookCopy className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold">Gerenciar Turmas</p>
                        <p className="text-sm text-muted-foreground">Criar e organizar turmas</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Última Prova Criada */}
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
                    <div className="flex gap-2 mt-3">
                      <Link to={`/exams/${lastExam.id}/edit`}>
                          <Button variant="outline" size="sm">Ver Detalhes</Button>
                      </Link>
                      <Link to={`/corrections-management/${lastExam.id}`}>
                          <Button variant="outline" size="sm" className="gap-2">
                            <ClipboardList className="w-4 h-4" />
                            Gestão de Gabaritos
                          </Button>
                      </Link>
                    </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Crie sua primeira prova para ver os detalhes aqui.</p>
                  <Link to="/exams/new">
                    <Button className="mt-4 gap-2">
                      <PlusCircle className="w-4 h-4" />
                      Criar Primeira Prova
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}