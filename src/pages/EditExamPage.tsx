import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, X, FileText, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { ExamHeaderEditor } from '@/components/ExamHeaderEditor';
import { CorrectionScanner } from '@/components/CorrectionScanner';

interface Question {
  id: string;
  title: string;
  content: any;
  type: string;
  subject: string;
  category: string | null;
  difficulty: string;
  tags: string[];
  points: number;
}

interface ExamData {
  id: string;
  title: string;
  subject: string;
  institution: string;
  examDate: string;
  selectedQuestions: Question[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  versions: number;
  layout: string;
  header_id?: string;
  qr_enabled: boolean;
  time_limit?: number;
}

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'corrections' | 'pdf'>('edit');

  useEffect(() => {
    if (id && user) {
      fetchExam();
    }
  }, [id, user]);

  const fetchExam = async () => {
    if (!id || !user) return;

    setLoading(true);
    try {
      const { data: exam, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', id)
        .eq('author_id', user.id)
        .single();

      if (examError || !exam) {
        throw new Error('Prova não encontrada');
      }

      // Buscar questões
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .in('id', exam.question_ids);

      if (questionsError) throw questionsError;

      setExamData({
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        institution: exam.institution || '',
        examDate: exam.exam_date ? new Date(exam.exam_date).toISOString().split('T')[0] : '',
        selectedQuestions: questionsData || [],
        shuffleQuestions: exam.shuffle_questions || false,
        shuffleOptions: exam.shuffle_options || false,
        versions: exam.versions || 1,
        layout: exam.layout || 'single_column',
        header_id: exam.header_id,
        qr_enabled: exam.qr_enabled !== false,
        time_limit: exam.time_limit
      });

      // Buscar todas as questões do usuário para seleção
      const { data: allQuestions, error: allQuestionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (allQuestionsError) throw allQuestionsError;
      setQuestions(allQuestions || []);

    } catch (error) {
      console.error('Erro ao buscar prova:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a prova.",
        variant: "destructive",
      });
      navigate('/exams');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!examData || !user) return;

    if (!examData.title.trim() || !examData.subject.trim() || examData.selectedQuestions.length === 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios e selecione pelo menos uma questão.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const totalPoints = examData.selectedQuestions.reduce((sum, q) => sum + q.points, 0);
      
      const updateData = {
        title: examData.title,
        subject: examData.subject,
        institution: examData.institution || null,
        exam_date: examData.examDate ? new Date(examData.examDate).toISOString() : null,
        question_ids: examData.selectedQuestions.map(q => q.id),
        total_points: totalPoints,
        layout: examData.layout,
        shuffle_questions: examData.shuffleQuestions,
        shuffle_options: examData.shuffleOptions,
        versions: examData.versions,
        header_id: examData.header_id || null,
        qr_enabled: examData.qr_enabled,
        time_limit: examData.time_limit || null,
        header: {
          institution: examData.institution,
          subject: examData.subject,
        },
        answer_sheet: {
          position: 'separate'
        }
      };

      const { error } = await supabase
        .from('exams')
        .update(updateData)
        .eq('id', examData.id);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Prova atualizada com sucesso.",
      });

    } catch (error) {
      console.error('Erro ao atualizar prova:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a prova.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async (version: number = 1, includeAnswers: boolean = false) => {
    if (!examData) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: {
          examId: examData.id,
          version,
          includeAnswers
        }
      });

      if (error) throw error;

      // Criar e baixar o PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }

      toast({
        title: "Sucesso!",
        description: `PDF da versão ${version} gerado com sucesso.`,
      });

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o PDF da prova.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleQuestionSelection = (question: Question) => {
    if (!examData) return;

    setExamData(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        selectedQuestions: prev.selectedQuestions.find(q => q.id === question.id)
          ? prev.selectedQuestions.filter(q => q.id !== question.id)
          : [...prev.selectedQuestions, question]
      };
    });
  };

  const removeSelectedQuestion = (questionId: string) => {
    if (!examData) return;
    
    setExamData(prev => {
      if (!prev) return prev;
      
      return {
        ...prev,
        selectedQuestions: prev.selectedQuestions.filter(q => q.id !== questionId)
      };
    });
  };

  if (loading || !examData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando prova...</p>
        </div>
      </div>
    );
  }

  const totalPoints = examData.selectedQuestions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/exams">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Editar Prova</h1>
            </div>
            <div className="flex space-x-2">
              {activeTab === 'edit' && (
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex space-x-4 mt-4">
            <Button
              variant={activeTab === 'edit' ? 'default' : 'outline'}
              onClick={() => setActiveTab('edit')}
            >
              Editar Prova
            </Button>
            <Button
              variant={activeTab === 'corrections' ? 'default' : 'outline'}
              onClick={() => setActiveTab('corrections')}
            >
              Correção Automática
            </Button>
            <Button
              variant={activeTab === 'pdf' ? 'default' : 'outline'}
              onClick={() => setActiveTab('pdf')}
            >
              Gerar PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'edit' && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Configurações da Prova */}
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Dados da Prova</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={examData.title}
                      onChange={(e) => setExamData(prev => prev ? { ...prev, title: e.target.value } : prev)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="subject">Matéria *</Label>
                    <Input
                      id="subject"
                      value={examData.subject}
                      onChange={(e) => setExamData(prev => prev ? { ...prev, subject: e.target.value } : prev)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="institution">Instituição</Label>
                    <Input
                      id="institution"
                      value={examData.institution}
                      onChange={(e) => setExamData(prev => prev ? { ...prev, institution: e.target.value } : prev)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="examDate">Data da Prova</Label>
                    <Input
                      id="examDate"
                      type="date"
                      value={examData.examDate}
                      onChange={(e) => setExamData(prev => prev ? { ...prev, examDate: e.target.value } : prev)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="timeLimit">Tempo Limite (minutos)</Label>
                    <Input
                      id="timeLimit"
                      type="number"
                      value={examData.time_limit || ''}
                      onChange={(e) => setExamData(prev => prev ? { 
                        ...prev, 
                        time_limit: e.target.value ? parseInt(e.target.value) : undefined 
                      } : prev)}
                      placeholder="Ex: 120"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Configurações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="layout">Layout</Label>
                    <Select 
                      value={examData.layout} 
                      onValueChange={(value) => setExamData(prev => prev ? { ...prev, layout: value } : prev)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_column">Uma Coluna</SelectItem>
                        <SelectItem value="double_column">Duas Colunas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="versions">Número de Versões</Label>
                    <Input
                      id="versions"
                      type="number"
                      min="1"
                      max="10"
                      value={examData.versions}
                      onChange={(e) => setExamData(prev => prev ? { 
                        ...prev, 
                        versions: parseInt(e.target.value) || 1 
                      } : prev)}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="qrEnabled"
                        checked={examData.qr_enabled}
                        onCheckedChange={(checked) => setExamData(prev => prev ? { 
                          ...prev, 
                          qr_enabled: !!checked 
                        } : prev)}
                      />
                      <Label htmlFor="qrEnabled">QR Code Habilitado</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="shuffleQuestions"
                        checked={examData.shuffleQuestions}
                        onCheckedChange={(checked) => setExamData(prev => prev ? { 
                          ...prev, 
                          shuffleQuestions: !!checked 
                        } : prev)}
                      />
                      <Label htmlFor="shuffleQuestions">Embaralhar Questões</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="shuffleOptions"
                        checked={examData.shuffleOptions}
                        onCheckedChange={(checked) => setExamData(prev => prev ? { 
                          ...prev, 
                          shuffleOptions: !!checked 
                        } : prev)}
                      />
                      <Label htmlFor="shuffleOptions">Embaralhar Alternativas</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ExamHeaderEditor
                selectedHeaderId={examData.header_id}
                onSelect={(header) => setExamData(prev => prev ? { 
                  ...prev, 
                  header_id: header.id 
                } : prev)}
              />

              {/* Questões Selecionadas */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    Questões Selecionadas ({examData.selectedQuestions.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Total: {totalPoints.toFixed(2)} pontos
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {examData.selectedQuestions.map((question) => (
                      <div key={question.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex-1">
                          <p className="text-sm font-medium truncate">{question.title}</p>
                          <p className="text-xs text-muted-foreground">{question.points} pontos</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelectedQuestion(question.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Banco de Questões */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Banco de Questões</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {questions.map((question) => {
                      const isSelected = examData.selectedQuestions.some(q => q.id === question.id);
                      return (
                        <div
                          key={question.id}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => toggleQuestionSelection(question)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium mb-1">{question.title}</h4>
                              <div className="flex flex-wrap gap-1 mb-2">
                                <Badge variant="outline" className="text-xs">{question.type}</Badge>
                                <Badge variant="outline" className="text-xs">{question.difficulty}</Badge>
                                <Badge variant="outline" className="text-xs">{question.points} pts</Badge>
                                <Badge variant="secondary" className="text-xs">{question.subject}</Badge>
                              </div>
                            </div>
                            <Checkbox checked={isSelected} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'corrections' && (
          <div className="max-w-2xl mx-auto">
            <CorrectionScanner
              examId={examData.id}
              onCorrectionComplete={(result) => {
                toast({
                  title: "Correção processada!",
                  description: `Pontuação: ${result.correction.score} pontos`,
                });
              }}
            />
          </div>
        )}

        {activeTab === 'pdf' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Gerar PDF da Prova</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {Array.from({ length: examData.versions }, (_, i) => i + 1).map(version => (
                    <div key={version} className="flex items-center justify-between p-4 border rounded">
                      <div>
                        <h4 className="font-medium">Versão {version}</h4>
                        <p className="text-sm text-muted-foreground">
                          {examData.shuffleQuestions ? 'Questões embaralhadas' : 'Questões em ordem'}
                          {examData.shuffleOptions ? ', alternativas embaralhadas' : ''}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          onClick={() => generatePDF(version, false)}
                          disabled={loading}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Prova
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => generatePDF(version, true)}
                          disabled={loading}
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Gabarito
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}