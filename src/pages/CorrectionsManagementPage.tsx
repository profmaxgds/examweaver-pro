import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Search, 
  Camera, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Edit, 
  Send, 
  Download,
  Upload,
  BarChart3,
  Clock,
  ArrowLeft,
  Filter,
  Users,
  Target,
  GraduationCap,
  Building
} from 'lucide-react';

interface ExamCorrection {
  id: string;
  student_name: string;
  student_identification: string;
  answers: Record<string, string[]>;
  score: number;
  max_score: number;
  percentage: number;
  auto_corrected: boolean;
  correction_date: string;
  image_url?: string;
  qr_code_data?: string;
}

interface Question {
  id: string;
  title: string;
  correct_answer: any;
  points: number;
  type: string;
  options?: any[];
}

interface Exam {
  id: string;
  title: string;
  subject: string;
  total_points: number;
  question_ids: string[];
  target_class_id?: string;
  institutions?: string;
}

interface Class {
  id: string;
  name: string;
  institution_header_id?: string;
}

export default function CorrectionsManagementPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [corrections, setCorrections] = useState<ExamCorrection[]>([]);
  const [filteredCorrections, setFilteredCorrections] = useState<ExamCorrection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorrection, setSelectedCorrection] = useState<ExamCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishingAll, setPublishingAll] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'auto' | 'manual'>('all');
  
  // Novos estados para filtros
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [selectedExamFilter, setSelectedExamFilter] = useState<string>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedInstitutionFilter, setSelectedInstitutionFilter] = useState<string>('all');

  useEffect(() => {
    if (examId) {
      loadExamData();
    } else {
      loadAllCorrections();
    }
  }, [examId]);

  useEffect(() => {
    filterCorrections();
  }, [corrections, searchTerm, filterStatus, selectedExamFilter, selectedClassFilter, selectedInstitutionFilter]);

  const loadExamData = async () => {
    try {
      setLoading(true);

      // Carregar dados da prova
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (examError) throw examError;
      setExam(examData);

      // Carregar questões
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .in('id', examData.question_ids);

      if (questionsError) throw questionsError;
      // Ordenar questões pela ordem no exam
      const orderedQuestions = examData.question_ids.map((id: string) => 
        questionsData.find(q => q.id === id)
      ).filter(Boolean);
      setQuestions(orderedQuestions as Question[]);

      // Carregar correções
      const { data: correctionsData, error: correctionsError } = await supabase
        .from('exam_corrections')
        .select('*')
        .eq('exam_id', examId)
        .order('correction_date', { ascending: false });

      if (correctionsError) throw correctionsError;
      setCorrections(correctionsData as ExamCorrection[]);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados da prova",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAllCorrections = async () => {
    try {
      setLoading(true);

      // Carregar todas as correções primeiro
      const { data: correctionsData, error: correctionsError } = await supabase
        .from('exam_corrections')
        .select('*')
        .eq('author_id', user!.id)
        .order('correction_date', { ascending: false });

      if (correctionsError) throw correctionsError;

      // Carregar dados dos exames
      const examIds = [...new Set(correctionsData.map(c => c.exam_id))];
      const { data: examsData, error: examsError } = await supabase
        .from('exams')
        .select('*')
        .in('id', examIds);

      if (examsError) throw examsError;

      // Combinar os dados
      const correctionsWithExams = correctionsData.map(correction => ({
        ...correction,
        exam: examsData.find(exam => exam.id === correction.exam_id)
      }));

      setCorrections(correctionsWithExams as any[]);

      // Carregar exames únicos para o filtro
      setExams(examsData || []);

      // Carregar turmas
      const { data: classesData } = await supabase
        .from('classes')
        .select('*')
        .eq('author_id', user!.id);
      setClasses(classesData || []);

      // Carregar instituições únicas
      const uniqueInstitutions = [...new Set(
        examsData
          ?.map(exam => exam.institutions)
          .filter(Boolean) || []
      )];
      setInstitutions(uniqueInstitutions);

    } catch (error) {
      console.error('Erro ao carregar correções:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar correções",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterCorrections = () => {
    let filtered = corrections;

    // Filtro por busca
    if (searchTerm) {
      filtered = filtered.filter(correction =>
        correction.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        correction.student_identification?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (examId ? false : (correction as any).exam?.title?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Filtro por status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(correction =>
        filterStatus === 'auto' ? correction.auto_corrected : !correction.auto_corrected
      );
    }

    // Filtro por prova
    if (selectedExamFilter !== 'all') {
      filtered = filtered.filter(correction =>
        (correction as any).exam?.id === selectedExamFilter
      );
    }

    // Filtro por turma
    if (selectedClassFilter !== 'all') {
      filtered = filtered.filter(correction =>
        (correction as any).exam?.target_class_id === selectedClassFilter
      );
    }

    // Filtro por instituição
    if (selectedInstitutionFilter !== 'all') {
      filtered = filtered.filter(correction =>
        (correction as any).exam?.institutions === selectedInstitutionFilter
      );
    }

    setFilteredCorrections(filtered);
  };

  const handleManualCorrection = async (correctionId: string, questionId: string, newAnswer: string[]) => {
    try {
      const correction = corrections.find(c => c.id === correctionId);
      if (!correction) return;

      const updatedAnswers = {
        ...correction.answers,
        [questionId]: newAnswer
      };

      // Recalcular nota
      let score = 0;
      questions.forEach(question => {
        const studentAnswer = updatedAnswers[question.id];
        const correctAnswer = question.correct_answer;
        
        if (studentAnswer && correctAnswer && 
            JSON.stringify(studentAnswer.sort()) === JSON.stringify(correctAnswer.sort())) {
          score += question.points;
        }
      });

      const percentage = exam ? (score / exam.total_points) * 100 : 0;

      const { error } = await supabase
        .from('exam_corrections')
        .update({
          answers: updatedAnswers,
          score,
          percentage,
          auto_corrected: false
        })
        .eq('id', correctionId);

      if (error) throw error;

      // Atualizar estado local
      const updatedCorrections = corrections.map(c =>
        c.id === correctionId
          ? { ...c, answers: updatedAnswers, score, percentage, auto_corrected: false }
          : c
      );
      setCorrections(updatedCorrections);

      toast({
        title: "Sucesso",
        description: "Correção manual salva com sucesso",
      });

    } catch (error) {
      console.error('Erro ao salvar correção:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar correção manual",
        variant: "destructive",
      });
    }
  };

  const publishCorrection = async (correctionId: string) => {
    try {
      // Aqui você pode implementar a lógica de publicação individual
      // Por exemplo, enviar email, marcar como publicada, etc.
      
      toast({
        title: "Sucesso",
        description: "Correção publicada com sucesso",
      });

    } catch (error) {
      console.error('Erro ao publicar correção:', error);
      toast({
        title: "Erro",
        description: "Erro ao publicar correção",
        variant: "destructive",
      });
    }
  };

  const publishAllCorrections = async () => {
    try {
      setPublishingAll(true);
      
      // Aqui você pode implementar a lógica de publicação em massa
      // Por exemplo, marcar as correções como publicadas, enviar emails, etc.
      
      toast({
        title: "Sucesso",
        description: `${filteredCorrections.length} correções publicadas com sucesso`,
      });

    } catch (error) {
      console.error('Erro ao publicar correções:', error);
      toast({
        title: "Erro",
        description: "Erro ao publicar correções",
        variant: "destructive",
      });
    } finally {
      setPublishingAll(false);
    }
  };

  const exportResults = () => {
    try {
      const csvData = filteredCorrections.map(correction => ({
        'Nome': correction.student_name,
        'Matrícula': correction.student_identification || '',
        'Nota': correction.score.toFixed(2),
        'Nota Máxima': correction.max_score.toFixed(2),
        'Percentual': correction.percentage.toFixed(1) + '%',
        'Tipo': correction.auto_corrected ? 'Automática' : 'Manual',
        'Data': new Date(correction.correction_date).toLocaleDateString('pt-BR')
      }));

      const csvContent = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `correções_${exam?.title || 'todas'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast({
        title: "Sucesso",
        description: "Resultados exportados com sucesso",
      });

    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast({
        title: "Erro",
        description: "Erro ao exportar resultados",
        variant: "destructive",
      });
    }
  };

  const getAnswerLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A, B, C, D, E
  };

  const calculateStats = () => {
    const total = filteredCorrections.length;
    const approved = filteredCorrections.filter(c => c.percentage >= 60).length;
    const failed = total - approved;
    const average = total > 0 ? 
      filteredCorrections.reduce((acc, c) => acc + c.percentage, 0) / total : 0;
    const autoCorrections = filteredCorrections.filter(c => c.auto_corrected).length;

    return { total, approved, failed, average, autoCorrections };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Gestão de Gabaritos</h1>
            <p className="text-muted-foreground mt-2">
              {exam ? `${exam.title} - ${exam.subject}` : 'Todas as Correções'}
            </p>
          </div>
        </div>
        <Button 
          onClick={() => navigate('/auto-correction')}
          className="gap-2"
        >
          <Camera className="w-4 h-4" />
          Nova Correção
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Primeira linha de filtros */}
            <div className="flex gap-4 items-center justify-between flex-wrap">
              <div className="flex gap-4 items-center flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder={`Buscar por nome${examId ? '' : ', prova'} ou matrícula...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="auto">Automáticas</SelectItem>
                    <SelectItem value="manual">Manuais</SelectItem>
                  </SelectContent>
                </Select>

                <Badge variant="outline" className="gap-2">
                  <FileText className="w-4 h-4" />
                  {filteredCorrections.length} resultados
                </Badge>
              </div>
            </div>

            {/* Segunda linha - Filtros por prova, turma e instituição */}
            {!examId && (
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filtros:</span>
                </div>
                
                <Select value={selectedExamFilter} onValueChange={setSelectedExamFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todas as provas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as provas</SelectItem>
                    {exams.map(exam => (
                      <SelectItem key={exam.id} value={exam.id}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          {exam.title}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todas as turmas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as turmas</SelectItem>
                    {classes.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-4 h-4" />
                          {cls.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedInstitutionFilter} onValueChange={setSelectedInstitutionFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todas as instituições" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as instituições</SelectItem>
                    {institutions.map(institution => (
                      <SelectItem key={institution} value={institution}>
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4" />
                          {institution}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters - Linha de ações */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center justify-between flex-wrap">
            <div></div>
            
            <div className="flex gap-2">
              <Button
                onClick={publishAllCorrections}
                disabled={filteredCorrections.length === 0 || publishingAll}
                className="gap-2"
                variant="default"
              >
                <Send className="w-4 h-4" />
                {publishingAll ? 'Publicando...' : 'Publicar Todas'}
              </Button>
              <Button 
                onClick={exportResults}
                disabled={filteredCorrections.length === 0}
                variant="outline" 
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total de Alunos</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Média da Turma</p>
                <p className="text-2xl font-bold">{stats.average.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Aprovados</p>
                <p className="text-2xl font-bold">{stats.approved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Reprovados</p>
                <p className="text-2xl font-bold">{stats.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Automáticas</p>
                <p className="text-2xl font-bold">{stats.autoCorrections}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Corrections Table */}
      <Card>
        <CardHeader>
          <CardTitle>Gabaritos e Correções</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCorrections.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma correção encontrada</p>
              <p className="text-sm text-muted-foreground mt-2">
                {searchTerm || filterStatus !== 'all' 
                  ? 'Tente ajustar os filtros de busca'
                  : 'Comece fazendo uma nova correção'
                }
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Matrícula</TableHead>
                  {!examId && <TableHead>Prova</TableHead>}
                  <TableHead>Nota</TableHead>
                  <TableHead>Percentual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCorrections.map((correction) => (
                  <TableRow key={correction.id}>
                    <TableCell className="font-medium">
                      {correction.student_name}
                    </TableCell>
                    <TableCell>{correction.student_identification}</TableCell>
                     {!examId && (
                       <TableCell>
                         <div>
                           <p className="font-medium">{(correction as any).exam?.title}</p>
                           <p className="text-sm text-muted-foreground">{(correction as any).exam?.subject}</p>
                         </div>
                       </TableCell>
                     )}
                    <TableCell>
                      <Badge variant={correction.percentage >= 60 ? "default" : "destructive"}>
                        {correction.score.toFixed(1)}/{correction.max_score}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {correction.percentage >= 60 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="font-mono">{correction.percentage.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={correction.percentage >= 60 ? "default" : "destructive"}>
                        {correction.percentage >= 60 ? "Aprovado" : "Reprovado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={correction.auto_corrected ? "secondary" : "outline"}>
                        {correction.auto_corrected ? "Automática" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(correction.correction_date).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedCorrection(correction)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>
                                Correção Detalhada - {correction.student_name}
                              </DialogTitle>
                            </DialogHeader>
                            {selectedCorrection && examId && (
                              <CorrectionDetailView
                                correction={selectedCorrection}
                                questions={questions}
                                onAnswerChange={handleManualCorrection}
                              />
                            )}
                          </DialogContent>
                        </Dialog>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => publishCorrection(correction.id)}
                          className="gap-1"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                        
                        {correction.image_url && (
                          <Button variant="outline" size="sm">
                            <Upload className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Component for detailed correction view
function CorrectionDetailView({ 
  correction, 
  questions, 
  onAnswerChange 
}: {
  correction: ExamCorrection;
  questions: Question[];
  onAnswerChange: (correctionId: string, questionId: string, newAnswer: string[]) => void;
}) {
  const getAnswerLetter = (index: number) => String.fromCharCode(65 + index);
  
  return (
    <div className="space-y-6">
      {/* Student Info */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Nome do Aluno</p>
          <p className="font-semibold">{correction.student_name}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Matrícula</p>
          <p className="font-semibold">{correction.student_identification}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Nota Final</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold">{correction.score.toFixed(1)}/{correction.max_score}</p>
            <Badge variant={correction.percentage >= 60 ? "default" : "destructive"}>
              {correction.percentage.toFixed(1)}%
            </Badge>
          </div>
        </div>
      </div>

      {/* Answer Sheet Style Layout */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Gabarito vs Respostas do Aluno</h3>
        
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16 text-center">Nº</TableHead>
                <TableHead className="text-center">Gabarito</TableHead>
                <TableHead className="text-center">A</TableHead>
                <TableHead className="text-center">B</TableHead>
                <TableHead className="text-center">C</TableHead>
                <TableHead className="text-center">D</TableHead>
                <TableHead className="text-center">E</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question, index) => {
                const studentAnswer = correction.answers[question.id] || [];
                const correctAnswer = question.correct_answer || [];
                const isCorrect = JSON.stringify(studentAnswer.sort()) === JSON.stringify(correctAnswer.sort());
                
                return (
                  <TableRow key={question.id} className={isCorrect ? "bg-green-50" : "bg-red-50"}>
                    <TableCell className="text-center font-bold">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {correctAnswer.join('')}
                      </Badge>
                    </TableCell>
                    {['A', 'B', 'C', 'D', 'E'].map(option => (
                      <TableCell key={option} className="text-center">
                        <div 
                          className={`w-8 h-8 mx-auto rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors
                            ${studentAnswer.includes(option) 
                              ? 'bg-primary border-primary text-primary-foreground' 
                              : 'border-muted-foreground hover:border-primary'
                            }`}
                          onClick={() => {
                            const newAnswer = studentAnswer.includes(option)
                              ? studentAnswer.filter(a => a !== option)
                              : [...studentAnswer.filter(a => a !== option), option];
                            onAnswerChange(correction.id, question.id, newAnswer);
                          }}
                        >
                          {studentAnswer.includes(option) && (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      {isCorrect ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {isCorrect ? question.points : 0}/{question.points}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Correction Image */}
      {correction.image_url && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Imagem do Gabarito Escaneado</h3>
          <div className="border rounded-lg p-4 bg-muted/30">
            <img 
              src={correction.image_url} 
              alt="Gabarito escaneado"
              className="max-w-full h-auto rounded border shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Status and Notes */}
      <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tipo de Correção</p>
          <Badge variant={correction.auto_corrected ? "secondary" : "outline"} className="mt-1">
            {correction.auto_corrected ? "Correção Automática" : "Correção Manual"}
          </Badge>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Data da Correção</p>
          <p className="mt-1">{new Date(correction.correction_date).toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </div>
  );
}