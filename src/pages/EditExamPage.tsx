import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { CorrectionScanner } from '@/components/CorrectionScanner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { QuestionEditor } from '@/components/QuestionEditor';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


import { ExamEditorContext, useExamEditor } from '@/components/exam-editor/ExamEditorContext';
import { QuestionBank } from '@/components/exam-editor/QuestionBank';
import { SelectedQuestionsList } from '@/components/exam-editor/SelectedQuestionsList';
import { ExamSettingsPanel } from '@/components/exam-editor/ExamSettingsPanel';
import { PdfGenerationPanel } from '@/components/exam-editor/PdfGenerationPanel';

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
  options: any[] | null;
  correct_answer: any;
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

function EditExamPanel() {
  return (
    <div className="space-y-6">
      <ExamSettingsPanel />
      <div className="grid lg:grid-cols-2 gap-6">
          <QuestionBank />
          <SelectedQuestionsList />
      </div>
    </div>
  );
}

function EditExamPageContent() {
  const { examData, handleSave, previewExam, loading, toast } = useExamEditor();
  const [activeTab, setActiveTab] = useState('edit');
  const [headerAlertOpen, setHeaderAlertOpen] = useState(false);
  const [pdfParams, setPdfParams] = useState<{version: number, includeAnswers: boolean} | null>(null);
  
  const handlePreviewClick = () => {
    if (!examData?.header_id) {
        setPdfParams({ version: 1, includeAnswers: false });
        setHeaderAlertOpen(true);
    } else {
        previewExam(1);
    }
  };

  const proceedWithPdfGeneration = () => {
    if (pdfParams) {
        previewExam(pdfParams.version, pdfParams.includeAnswers);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <AlertDialog open={headerAlertOpen} onOpenChange={setHeaderAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Nenhum Cabeçalho Selecionado</AlertDialogTitle>
            <AlertDialogDescription>
                Sua prova será gerada com um cabeçalho padrão contendo o título e a matéria. Deseja continuar?
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActiveTab('edit')}>Cancelar e Editar</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithPdfGeneration}>Continuar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/exams">
                <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
              </Link>
              <h1 className="text-2xl font-bold">Editar Prova</h1>
            </div>
             <div className="flex space-x-2">
              {activeTab === 'edit' && (
                <>
                  <Button variant="outline" onClick={handlePreviewClick} disabled={loading}>
                    <Eye className="w-4 h-4 mr-2" />
                    Visualizar Prova
                  </Button>
                  <Button onClick={handleSave} disabled={loading}>
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex space-x-4 mt-4">
            <Button variant={activeTab === 'edit' ? 'default' : 'outline'} onClick={() => setActiveTab('edit')}>Editar Prova</Button>
            <Button variant={activeTab === 'corrections' ? 'default' : 'outline'} onClick={() => setActiveTab('corrections')}>Correção Automática</Button>
            <Button variant={activeTab === 'pdf' ? 'default' : 'outline'} onClick={() => setActiveTab('pdf')}>Gerar PDF</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'edit' && <EditExamPanel />}
        {activeTab === 'corrections' && examData && (
          <div className="max-w-2xl mx-auto">
            <CorrectionScanner examId={examData.id} onCorrectionComplete={(result) => {
              toast({ title: "Correção processada!", description: `Pontuação: ${result.correction.score} pontos` });
            }}/>
          </div>
        )}
        {activeTab === 'pdf' && <PdfGenerationPanel />}
      </main>
    </div>
  );
}

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);

   useEffect(() => {
    if (id && user) {
      fetchExamAndQuestions();
    }
  }, [id, user]);

  const fetchExamAndQuestions = async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      // **CORRIGIDO:** Busca sem o join problemático. A busca do header será feita na função.
      const examPromise = supabase.from('exams').select('*').eq('id', id).eq('author_id', user.id).single();
      const allQuestionsPromise = supabase.from('questions').select('*').eq('author_id', user.id).order('created_at', { ascending: false });

      const [{ data: exam, error: examError }, { data: allQs, error: allQsError }] = await Promise.all([examPromise, allQuestionsPromise]);

      if (examError || !exam) throw new Error('Prova não encontrada');
      if (allQsError) throw allQsError;
      
      setAllQuestions(allQs || []);

      const selectedQs = allQs?.filter(q => exam.question_ids.includes(q.id)) || [];

      setExamData({
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        institution: exam.institution || '',
        examDate: exam.exam_date ? new Date(exam.exam_date).toISOString().split('T')[0] : '',
        selectedQuestions: selectedQs,
        shuffleQuestions: exam.shuffle_questions || false,
        shuffleOptions: exam.shuffle_options || false,
        versions: exam.versions || 1,
        layout: exam.layout || 'single_column',
        header_id: exam.header_id,
        qr_enabled: exam.qr_enabled !== false,
        time_limit: exam.time_limit
      });
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      toast({ title: "Erro", description: "Não foi possível carregar os dados da prova.", variant: "destructive" });
      navigate('/exams');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!examData) return;
    setLoading(true);
    try {
      const totalPoints = examData.selectedQuestions.reduce((sum, q) => sum + q.points, 0);
      
      const updateData = {
        title: examData.title,
        subject: examData.subject,
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

    } catch (error: any) {
      console.error('Erro ao atualizar prova:', error);
      toast({
        title: "Erro",
        description: `Não foi possível atualizar a prova: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateAndDownloadFile = (htmlContent: string, filename: string) => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

      const { html, examTitle } = data;
      const filename = `${examTitle.replace(/\s+/g, '_')}_v${version}${includeAnswers ? '_gabarito' : ''}.html`;
      
      generateAndDownloadFile(html, filename);

      toast({
        title: "Sucesso!",
        description: `Arquivo da Versão ${version} ${includeAnswers ? 'com gabarito' : 'da prova'} gerado com sucesso.`,
      });

    } catch (error: any) {
      console.error('Erro ao gerar arquivo:', error);
      toast({
        title: "Erro",
        description: `Não foi possível gerar o arquivo da prova: ${error.message}`,
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
      toast({ title: "Sucesso!", description: "Todos os arquivos foram gerados com sucesso." });
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível gerar todos os arquivos.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const previewExam = async (version: number = 1, includeAnswers: boolean = false) => {
    if (!examData) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { examId: examData.id, version, includeAnswers }
      });
      if (error) throw error;
      const { html } = data;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch (error: any) {
      toast({ title: "Erro", description: `Não foi possível gerar a visualização da prova: ${error.message}`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  
  const toggleQuestionSelection = (question: Question) => {
    setExamData(prev => {
      if (!prev) return null;
      const isSelected = prev.selectedQuestions.some(q => q.id === question.id);
      return {
        ...prev,
        selectedQuestions: isSelected
          ? prev.selectedQuestions.filter(q => q.id !== question.id)
          : [...prev.selectedQuestions, question]
      };
    });
  };

  const removeSelectedQuestion = (questionId: string) => {
     setExamData(prev => prev ? {
      ...prev,
      selectedQuestions: prev.selectedQuestions.filter(q => q.id !== questionId)
    } : null);
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
          ? questionData.options.filter((opt: any) => opt.isCorrect).map((opt: any) => opt.id)
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
      fetchExamAndQuestions(); // Recarrega todos os dados
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

  return (
    <ExamEditorContext.Provider value={{ 
        examData, 
        setExamData, 
        allQuestions, 
        toggleQuestionSelection, 
        removeSelectedQuestion,
        loading,
        setPreviewQuestion,
        setEditQuestion,
        handleSave,
        previewExam,
        generatePDF,
        generateAllPDFs,
        toast
    }}>
      <EditExamPageContent />
      
       <Dialog open={!!previewQuestion} onOpenChange={() => setPreviewQuestion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {previewQuestion && (
            <div className="p-4">
              <h4 className="font-medium mb-2">{previewQuestion.title}</h4>
              <div className="prose" dangerouslySetInnerHTML={{ __html: previewQuestion.content }} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editQuestion} onOpenChange={() => setEditQuestion(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {editQuestion && (
            <QuestionEditor
              initialData={{
                title: editQuestion.title,
                content: typeof editQuestion.content === 'string' ? editQuestion.content : JSON.stringify(editQuestion.content),
                type: editQuestion.type as 'multiple_choice' | 'true_false' | 'essay',
                options: editQuestion.type === 'multiple_choice' && Array.isArray(editQuestion.options) ? editQuestion.options.map((opt: any) => ({
                  id: opt.id,
                  text: opt.text,
                  isCorrect: Array.isArray(editQuestion.correct_answer) ? editQuestion.correct_answer.includes(opt.id) : false,
                })) : [],
                correctAnswer: editQuestion.correct_answer,
                category: editQuestion.category || '',
                subject: editQuestion.subject,
                institution: editQuestion.institution || '',
                difficulty: editQuestion.difficulty as 'easy' | 'medium' | 'hard' | 'custom',
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
    </ExamEditorContext.Provider>
  );
}