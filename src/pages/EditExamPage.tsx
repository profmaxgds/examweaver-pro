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
import { ArrowLeft, Eye, Edit, Copy, Trash2, FileText, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { ExamHeaderEditor } from '@/components/ExamHeaderEditor';
import { CorrectionScanner } from '@/components/CorrectionScanner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import QuestionEditor from '@/components/QuestionEditor'; // Importando o componente QuestionEditor

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
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);

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
      const response = await supabase.functions.invoke('generate-exam-pdf', {
        body: {
          examId: examData.id,
          version,
          includeAnswers
        }
      });

      if (response.error) throw response.error;

      const { pdfBase64, filename } = response.data;
      
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = filename || `exam_v${version}${includeAnswers ? '_answerkey' : ''}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Sucesso!",
        description: `PDF da versão ${version} ${includeAnswers ? 'gabarito' : 'prova'} gerado com sucesso.`,
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

  const generateAllPDFs = async () => {
    if (!examData) return;

    setLoading(true);
    try {
      for (let version = 1; version <= examData.versions; version++) {
        await generatePDF(version, false);
        await generatePDF(version, true);
      }

      toast({
        title: "Sucesso!",
        description: "Todos os PDFs foram gerados com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao gerar todos os PDFs:', error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar todos os PDFs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const previewExam = async (version: number = 1) => {
    if (!examData) return;

    setLoading(true);
    try {
      const response = await supabase.functions.invoke('generate-exam-pdf', {
        body: {
          examId: examData.id,
          version,
          includeAnswers: false,
          preview: true
        }
      });

      if (response.error) throw response.error;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(response.data.html);
        printWindow.document.close();
      }

      toast({
        title: "Sucesso!",
        description: `Visualização da versão ${version} gerada com sucesso.`,
      });

    } catch (error) {
      console.error('Erro ao visualizar prova:', error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar a visualização da prova.",
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

  const handleUpdateQuestion = async (questionData: any) => {
    if (!editQuestion) return;

    setLoading(true);
    try {
      const updateData = {
        title: questionData.title,
        content: questionData.content,
        type: questionData.type,
        options: questionData.type === 'multiple_choice' ? questionData.options : null,
        correct_answer: questionData.type === 'multiple_choice'
          ? questionData.options.filter(opt => opt.isCorrect).map(opt => opt.id)
          : questionData.correctAnswer,
        category: questionData.category || null,
        subject: questionData.subject,
        institution: questionData.institution || null,
        difficulty: questionData.difficulty,
        tags: questionData.tags,
        points: questionData.points,
        language: questionData.language,
      };

      const { error } = await supabase
        .from('questions')
        .update(updateData)
        .eq('id', editQuestion.id);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Questão atualizada com sucesso.",
      });

      setEditQuestion(null);
      fetchExam(); // Recarrega os dados da prova
    } catch (error) {
      console.error('Erro ao atualizar questão:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a questão.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
          <div className="grid gap-6">
            <div className="grid lg:grid-cols-3 gap-6">
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
            </div>

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
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {examData.selectedQuestions.map((question) => (
                    <div key={question.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">{question.title}</p>
                        <p className="text-xs text-muted-foreground">{question.points} pontos</p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewQuestion(question)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditQuestion(question)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeSelectedQuestion(question.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Banco de Questões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {questions.slice(0, 3).map((question) => {
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
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewQuestion(question);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditQuestion(question);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Checkbox checked={isSelected} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
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
                <Button
                  onClick={generateAllPDFs}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'Gerando...' : 'Gerar Todas as Versões e Gabaritos'}
                </Button>
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
                          size="sm"
                          onClick={() => previewExam(version)}
                          disabled={loading}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Visualizar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generatePDF(version, false)}
                          disabled={loading}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Prova
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
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

      {/* Dialog para Pré-visualização da Questão */}
      <Dialog open={!!previewQuestion} onOpenChange={() => setPreviewQuestion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {previewQuestion && (
            <div className="p-4">
              <h4 className="font-medium mb-2">{previewQuestion.title}</h4>
              <div className="prose" dangerouslySetInnerHTML={{ __html: previewQuestion.content }} />
              <div className="mt-4 flex justify-end space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditQuestion(previewQuestion)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar Questão
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPreviewQuestion(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para Edição da Questão */}
      <Dialog open={!!editQuestion} onOpenChange={() => setEditQuestion(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {editQuestion && (
            <QuestionEditor
              initialData={{
                title: editQuestion.title,
                content: typeof editQuestion.content === 'string' ? editQuestion.content : JSON.stringify(editQuestion.content),
                type: editQuestion.type as 'multiple_choice' | 'true_false' | 'essay',
                options: editQuestion.type === 'multiple_choice' ? editQuestion.content.options.map((opt: any) => ({
                  id: opt.id,
                  text: opt.text,
                  isCorrect: Array.isArray(editQuestion.correct_answer) ? editQuestion.correct_answer.includes(opt.id) : false,
                })) : [],
                correctAnswer: editQuestion.correct_answer,
                category: editQuestion.category || '',
                subject: editQuestion.subject,
                institution: editQuestion.institution || '',
                difficulty: editQuestion.difficulty,
                tags: editQuestion.tags || [],
                points: editQuestion.points,
                language: 'pt',
              }}
              onSave={handleUpdateQuestion}
              loading={loading}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}