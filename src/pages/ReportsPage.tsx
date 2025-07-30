import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Download, TrendingUp, Users, FileText, Trophy } from 'lucide-react';

interface Exam {
  id: string;
  title: string;
  subject: string;
  total_points: number;
}

interface Correction {
  id: string;
  exam_id: string;
  student_name: string;
  score: number;
  status: string;
  created_at: string;
}

interface ReportData {
  examStats: any;
  gradeDistribution: any[];
  questionAnalysis: any[];
  timeSeriesData: any[];
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchExams();
  }, [user]);

  useEffect(() => {
    if (selectedExam) {
      fetchCorrections();
    } else {
      setReportData(null);
      setCorrections([]);
    }
  }, [selectedExam]);

  const fetchExams = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, subject, total_points')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      console.error('Erro ao buscar provas:', error);
      toast({ title: "Erro", description: "Não foi possível carregar as provas.", variant: "destructive" });
    }
  };

  const fetchCorrections = async () => {
    if (!user || !selectedExam) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('corrections')
        .select('*')
        .eq('exam_id', selectedExam)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const correctionsData = data || [];
      setCorrections(correctionsData);
      generateReportData(correctionsData);
    } catch (error) {
      console.error('Erro ao buscar correções:', error);
      toast({ title: "Erro", description: "Não foi possível carregar as correções.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateReportData = (correctionsData: Correction[]) => {
    const exam = exams.find(e => e.id === selectedExam);
    if (!exam || correctionsData.length === 0) {
      setReportData(null);
      return;
    }

    const scores = correctionsData.map(c => c.score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const passRate = scores.filter(s => s >= exam.total_points * 0.6).length / scores.length * 100;

    const examStats = {
      totalStudents: correctionsData.length,
      averageScore: averageScore.toFixed(2),
      maxScore,
      minScore,
      passRate: passRate.toFixed(1),
      totalPoints: exam.total_points
    };

    const gradeRanges = [
      { name: '0-20%', min: 0, max: exam.total_points * 0.2, count: 0 },
      { name: '21-40%', min: exam.total_points * 0.2, max: exam.total_points * 0.4, count: 0 },
      { name: '41-60%', min: exam.total_points * 0.4, max: exam.total_points * 0.6, count: 0 },
      { name: '61-80%', min: exam.total_points * 0.6, max: exam.total_points * 0.8, count: 0 },
      { name: '81-100%', min: exam.total_points * 0.8, max: exam.total_points, count: 0 }
    ];

    scores.forEach(score => {
      for (const range of gradeRanges) {
        if (score >= range.min && score <= range.max) {
          range.count++;
          break;
        }
      }
    });

    const gradeDistribution = gradeRanges.map(range => ({
      name: range.name,
      value: range.count
    }));

    const timeSeriesData = correctionsData
      .map(c => ({
        date: new Date(c.created_at).toLocaleDateString('pt-BR'),
        score: c.score,
      }))
      .reverse();

    setReportData({
      examStats,
      gradeDistribution,
      questionAnalysis: [], // Deixado para implementação futura com dados mais detalhados
      timeSeriesData
    });
  };

  const exportReport = async () => {
    if (!reportData || !selectedExam) return;
    try {
      const exam = exams.find(e => e.id === selectedExam);
      const reportDoc = {
        exam: exam?.title,
        subject: exam?.subject,
        generatedAt: new Date().toLocaleString('pt-BR'),
        stats: reportData.examStats,
        corrections: corrections.map(c => ({
          student: c.student_name,
          score: c.score,
          percentage: ((c.score / (exam?.total_points || 1)) * 100).toFixed(1),
          date: new Date(c.created_at).toLocaleDateString('pt-BR')
        }))
      };

      const { error } = await supabase
        .from('reports')
        .insert({
          author_id: user.id,
          exam_id: selectedExam,
          type: 'exam_statistics',
          data: reportDoc
        });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(reportDoc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${exam?.title.replace(/\s+/g, '-')}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Sucesso!", description: "Relatório exportado com sucesso." });
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      toast({ title: "Erro", description: "Não foi possível exportar o relatório.", variant: "destructive" });
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Relatórios e Estatísticas</h1>
            {reportData && (
              <Button onClick={exportReport}>
                <Download className="w-4 h-4 mr-2" />
                Exportar Relatório
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selecionar Prova</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedExam} onValueChange={setSelectedExam}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma prova para visualizar relatórios" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map(exam => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.title} - {exam.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {loading && <Card><CardContent className="py-8 text-center"><p>Carregando dados...</p></CardContent></Card>}

          {reportData && !loading && (
            <>
              {/* Cards de Estatísticas */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Alunos</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold">{reportData.examStats.totalStudents}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Média Geral</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.examStats.averageScore}</div>
                    <p className="text-xs text-muted-foreground">de {reportData.examStats.totalPoints} pontos</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taxa de Aprovação</CardTitle>
                    <Trophy className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.examStats.passRate}%</div>
                    <p className="text-xs text-muted-foreground">(≥60% da nota total)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Amplitude</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.examStats.minScore} - {reportData.examStats.maxScore}</div>
                    <p className="text-xs text-muted-foreground">Menor e maior nota</p>
                  </CardContent>
                </Card>
              </div>

              {/* Gráficos */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Distribuição de Notas</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={reportData.gradeDistribution}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Distribuição Percentual</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={reportData.gradeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#8884d8">
                          {reportData.gradeDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {reportData.timeSeriesData.length > 1 && (
                <Card>
                  <CardHeader><CardTitle>Evolução das Notas</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={reportData.timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Line type="monotone" dataKey="score" stroke="#8884d8" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Lista de Correções */}
              <Card>
                <CardHeader><CardTitle>Correções Realizadas</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b"><th className="text-left p-2">Estudante</th><th className="text-left p-2">Pontuação</th><th className="text-left p-2">Percentual</th><th className="text-left p-2">Status</th><th className="text-left p-2">Data</th></tr>
                      </thead>
                      <tbody>
                        {corrections.map((correction) => {
                          const exam = exams.find(e => e.id === selectedExam);
                          const percentage = exam ? ((correction.score / exam.total_points) * 100).toFixed(1) : '0';
                          return (
                            <tr key={correction.id} className="border-b">
                              <td className="p-2">{correction.student_name}</td>
                              <td className="p-2">{correction.score} / {exam?.total_points}</td>
                              <td className="p-2">{percentage}%</td>
                              <td className="p-2"><span className={`px-2 py-1 rounded-full text-xs ${correction.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{correction.status === 'completed' ? 'Concluída' : 'Pendente'}</span></td>
                              <td className="p-2">{new Date(correction.created_at).toLocaleDateString('pt-BR')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {selectedExam && !loading && !reportData && (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhuma correção encontrada para esta prova.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}