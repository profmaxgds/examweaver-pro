// src/pages/EditExamPage.tsx

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { CorrectionScanner } from '@/components/CorrectionScanner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { QuestionEditor } from '@/components/QuestionEditor';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ExamEditorContext, useExamEditor } from '@/components/exam-editor/ExamEditorContext';
import { QuestionBank } from '@/components/exam-editor/QuestionBank';
import { SelectedQuestionsList } from '@/components/exam-editor/SelectedQuestionsList';
import { ExamSettingsPanel } from '@/components/exam-editor/ExamSettingsPanel';
import { PdfGenerationPanel } from '@/components/exam-editor/PdfGenerationPanel';
import JSZip from 'jszip';

// Interfaces
interface Question {
  id: string; title: string; content: any; type: string; subject: string; category: string | null;
  difficulty: string; tags: string[]; points: number; options: {id: string, text: string}[] | null; correct_answer: any;
}

// Interface principal ATUALIZADA para incluir as novas configurações
interface ExamData {
  id: string; title: string; subject: string; institution: string; examDate: string;
  selectedQuestions: Question[]; shuffleQuestions: boolean; shuffleOptions: boolean;
  versions: number; layout: string; header_id?: string; qr_enabled: boolean;
  time_limit?: number; generation_mode?: 'versions' | 'class'; target_class_id?: string;
}

// Função de embaralhamento determinístico para garantir consistência
const seededShuffle = <T,>(array: T[], seed: string): T[] => {
    let currentIndex = array.length, randomIndex;
    const newArray = [...array];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    const random = () => {
        let x = Math.sin(hash++) * 10000;
        return x - Math.floor(x);
    };
    while (currentIndex !== 0) {
        randomIndex = Math.floor(random() * currentIndex);
        currentIndex--;
        [newArray[currentIndex], newArray[randomIndex]] = [newArray[randomIndex], newArray[currentIndex]];
    }
    return newArray;
};

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
  const { examData, handleSave, handlePrepareExams, previewExam, loading, isPreparing, toast } = useExamEditor();
  const [activeTab, setActiveTab] = useState('edit');
  const [headerAlertOpen, setHeaderAlertOpen] = useState(false);
  const [pdfParams, setPdfParams] = useState<{id: string | number, includeAnswers: boolean} | null>(null);
  
  const handlePreviewClick = () => {
    if (!examData?.header_id) {
        setPdfParams({ id: 1, includeAnswers: false });
        setHeaderAlertOpen(true);
    } else {
        previewExam(1);
    }
  };

  const proceedWithPdfGeneration = () => {
    if (pdfParams) {
        previewExam(typeof pdfParams.id === 'string' ? pdfParams.id : Number(pdfParams.id));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AlertDialog open={headerAlertOpen} onOpenChange={setHeaderAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Nenhum Cabeçalho Selecionado</AlertDialogTitle>
            <AlertDialogDescription>
                Sua prova será gerada com um cabeçalho padrão. Deseja continuar?
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
                  <Button variant="outline" onClick={handlePreviewClick} disabled={loading || isPreparing}>
                    <Eye className="w-4 h-4 mr-2" />
                    Visualizar Padrão
                  </Button>
                  <Button onClick={handleSave} disabled={loading || isPreparing}>
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                  {/* NOVO BOTÃO DE PREPARAR PROVAS */}
                  {examData?.generation_mode === 'class' && (
                    <Button onClick={handlePrepareExams} disabled={loading || isPreparing}>
                        {isPreparing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparando...</> : 'Preparar Provas para Turma'}
                    </Button>
                  )}
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
  const [isPreparing, setIsPreparing] = useState(false);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);

  const fetchExamAndQuestions = useCallback(async (force = false) => {
    if (!force && examData) return;
    if (!id || !user) return;
    setLoading(true);
    try {
      const examPromise = supabase.from('exams').select('*').eq('id', id).eq('author_id', user.id).single();
      const allQuestionsPromise = supabase.from('questions').select('*').eq('author_id', user.id).order('created_at', { ascending: false });

      const [{ data: exam, error: examError }, { data: allQs, error: allQsError }] = await Promise.all([examPromise, allQuestionsPromise]);

      if (examError || !exam) {
        toast({ title: "Erro", description: "Prova não encontrada ou você não tem permissão para acessá-la.", variant: "destructive" });
        navigate('/exams');
        return;
      };
      if (allQsError) throw allQsError;
      
      const currentQuestions = (allQs || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options.map((opt: any) => ({
          id: opt.id || opt,
          text: opt.text || opt
        })) : (q.options ? [q.options] : null)
      })) as Question[];
      setAllQuestions(currentQuestions);

      const selectedQs = currentQuestions
        .filter(q => exam.question_ids.includes(q.id));

      setExamData({
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        institution: exam.institutions || '',
        examDate: exam.exam_date ? new Date(exam.exam_date).toISOString().split('T')[0] : '',
        selectedQuestions: selectedQs,
        shuffleQuestions: exam.shuffle_questions || false,
        shuffleOptions: exam.shuffle_options || false,
        versions: exam.versions || 1,
        layout: exam.layout || 'single_column',
        header_id: exam.header_id,
        qr_enabled: exam.qr_enabled !== false,
        time_limit: exam.time_limit,
        generation_mode: (exam.generation_mode as 'versions' | 'class') || 'versions',
        target_class_id: exam.target_class_id,
      });

    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }, [id, user, navigate, toast]);

  useEffect(() => {
    fetchExamAndQuestions(true);
  }, [fetchExamAndQuestions]);

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
        generation_mode: examData.generation_mode,
        target_class_id: examData.generation_mode === 'class' ? examData.target_class_id : null,
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

  const handlePrepareExams = async () => {
    if (!examData || examData.generation_mode !== 'class' || !examData.target_class_id) {
        toast({ title: "Atenção", description: "Selecione o modo 'Turma' e uma turma para preparar as provas.", variant: "destructive" });
        return;
    }
    setIsPreparing(true);
    try {
        const { data: students, error: studentsError } = await supabase.from('students').select('id').eq('class_id', examData.target_class_id);
        if (studentsError) throw studentsError;
        if (!students || students.length === 0) {
            toast({ title: "Nenhum Aluno", description: "Não há alunos nesta turma para preparar provas.", variant: "destructive" });
            setIsPreparing(false);
            return;
        }

        const instancesToUpsert = [];
        for (const student of students) {
            const studentSeed = `${examData.id}-${student.id}`;
            const shuffledQuestions = examData.shuffleQuestions ? seededShuffle(examData.selectedQuestions, studentSeed) : examData.selectedQuestions;
            const shuffled_question_ids = shuffledQuestions.map(q => q.id);

            const shuffled_options_map: { [key: string]: string[] } = {};
            const answer_key: { [key: string]: any } = {};

            shuffledQuestions.forEach(q => {
                if (q.type === 'multiple_choice' && q.options) {
                    const questionSeed = `${studentSeed}-${q.id}`;
                    const shuffledOpts = examData.shuffleOptions ? seededShuffle(q.options, questionSeed) : q.options;
                    shuffled_options_map[q.id] = shuffledOpts.map(opt => opt.id);
                    answer_key[q.id] = q.correct_answer;
                }
            });

            instancesToUpsert.push({
                exam_id: examData.id,
                student_id: student.id,
                author_id: user!.id,
                shuffled_question_ids,
                shuffled_options_map,
                answer_key
            });
        }

        const { error } = await supabase.from('student_exams').upsert(instancesToUpsert, { onConflict: 'exam_id, student_id' });
        if (error) throw error;

        toast({ title: "Sucesso!", description: `${students.length} provas foram preparadas ou atualizadas para a turma.` });
    } catch (error: any) {
        toast({ title: "Erro ao Preparar", description: error.message, variant: "destructive" });
    } finally {
        setIsPreparing(false);
    }
  };

  // Função para criar gabarito de versão se não existir
  const createVersionAnswerKey = async (version: number) => {
    if (!examData || !user) return;

    // Verificar se já existe gabarito para esta versão
    const { data: existing } = await supabase
      .from('student_exams')
      .select('id')
      .eq('exam_id', examData.id)
      .eq('student_id', `version-${version}`)
      .eq('author_id', user.id)
      .single();

    if (existing) return; // Já existe

    // Criar gabarito para a versão
    const versionSeed = `${examData.id}-version-${version}`;
    const shuffledQuestions = examData.shuffleQuestions ? seededShuffle(examData.selectedQuestions, versionSeed) : examData.selectedQuestions;
    const shuffled_question_ids = shuffledQuestions.map(q => q.id);

    const shuffled_options_map: { [key: string]: string[] } = {};
    const answer_key: { [key: string]: any } = {};

    shuffledQuestions.forEach(q => {
      if (q.type === 'multiple_choice' && q.options) {
        const questionSeed = `${versionSeed}-${q.id}`;
        const shuffledOpts = examData.shuffleOptions ? seededShuffle(q.options, questionSeed) : q.options;
        shuffled_options_map[q.id] = shuffledOpts.map(opt => opt.id);
        answer_key[q.id] = q.correct_answer;
      }
    });

    await supabase.from('student_exams').insert({
      exam_id: examData.id,
      student_id: `version-${version}`, // ID especial para versões
      author_id: user.id,
      shuffled_question_ids,
      shuffled_options_map,
      answer_key
    });
  };


  const openPrintDialog = (htmlContent: string) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    } else {
      toast({
        title: "Erro",
        description: "Não foi possível abrir a janela de impressão. Verifique as configurações de pop-up do seu navegador.",
        variant: "destructive",
      });
    }
  };

  const callGeneratePdfFunction = async (payload: object, asPDF: boolean = false) => {
    const response = await supabase.functions.invoke('generate-pdf', { 
      body: { ...payload, generatePDF: asPDF } 
    });
    if (response.error) throw new Error(response.error.message);
    
    if (asPDF) {
      // Retornar blob do PDF diretamente
      return response.data;
    } else {
      // Retornar HTML para preview
      return response.data.html;
    }
  };

  const generatePDF = async (id: string | number, includeAnswers: boolean = false) => {
    if (!examData) return;
    setLoading(true);
    try {
        // Criar gabarito para versão se não existir
        if (typeof id === 'number' && !includeAnswers) {
            await createVersionAnswerKey(id);
        }

        const payload = typeof id === 'string'
            ? { studentExamId: id, includeAnswers } // Para turma, 'id' é o student_exam_id
            : { examId: examData.id, version: id, includeAnswers }; // Para versões, 'id' é o número da versão

        const response = await supabase.functions.invoke('generate-pdf', { 
          body: { ...payload, generatePDF: true } 
        });
        
        if (response.error) {
          throw new Error(response.error.message);
        }

        // Verificar se a resposta contém HTML para conversão
        if (response.data && typeof response.data === 'string') {
          // Recebemos HTML, vamos converter para PDF usando o navegador
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(response.data);
            printWindow.document.close();
            
            // Aguardar um pouco para o conteúdo carregar e então abrir o diálogo de impressão
            setTimeout(() => {
              printWindow.print();
            }, 1000);
          }
          
          const fileName = typeof id === 'string'
            ? `${examData.title}_${id}_${includeAnswers ? 'gabarito' : 'prova'}`
            : `${examData.title}_v${id}_${includeAnswers ? 'gabarito' : 'prova'}`;
            
          toast({ title: "Sucesso!", description: `Arquivo pronto para salvar como PDF: ${fileName}` });
        } else {
          throw new Error('Resposta inválida do servidor');
        }
    } catch (error: any) {
        console.error('Erro ao gerar PDF:', error);
        toast({ title: "Erro", description: `Não foi possível gerar o PDF: ${error.message}`, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  const generateAllPDFs = async () => {
    if (!examData) return;
    setLoading(true);
    toast({ title: "Iniciando Geração", description: "Preparando arquivos para download..." });
    try {
        const zip = new JSZip();
        
        if (examData.generation_mode === 'class' && examData.target_class_id) {
            const { data: preparedExams, error } = await supabase.from('student_exams').select('id, student:students(name)').eq('exam_id', examData.id);
            if (error) throw error;
            if (!preparedExams || preparedExams.length === 0) {
                toast({ title: "Atenção", description: "Nenhuma prova preparada encontrada. Clique em 'Preparar Provas' primeiro.", variant: "destructive" });
                return;
            }
            for (const pExam of preparedExams) {
                const html = await callGeneratePdfFunction({ studentExamId: pExam.id, includeAnswers: false });
                zip.file(`${pExam.student.name.replace(/\s/g, '_')}_prova.html`, html);
            }
        } else {
            // Para provas por versão, criar gabaritos e gerar PDFs
            for (let version = 1; version <= examData.versions; version++) {
                await createVersionAnswerKey(version);
                const htmlProva = await callGeneratePdfFunction({ examId: examData.id, version: version, includeAnswers: false });
                const htmlGabarito = await callGeneratePdfFunction({ examId: examData.id, version: version, includeAnswers: true });
                zip.file(`Versao_${version}_Prova.html`, htmlProva);
                zip.file(`Versao_${version}_Gabarito.html`, htmlGabarito);
            }
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `${examData.title.replace(/\s/g, '_')}_provas.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

    } catch(error: any) {
        toast({ title: "Erro ao gerar ZIP", description: error.message, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  const previewExam = async (id: string | number = 1, includeAnswers = false) => {
    if (!examData) return;
    setLoading(true);
    try {
        const payload = typeof id === 'string'
            ? { studentExamId: id, includeAnswers }
            : { examId: examData.id, version: id, includeAnswers };
      
        const html = await callGeneratePdfFunction(payload, false); // HTML para preview
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
        }
    } catch (error: any) {
        toast({ title: "Erro", description: `Não foi possível gerar a visualização: ${error.message}`, variant: "destructive" });
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
        selectedQuestions: isSelected ? prev.selectedQuestions.filter(q => q.id !== question.id) : [...prev.selectedQuestions, question]
      };
    });
  };

  const removeSelectedQuestion = (questionId: string) => {
     setExamData(prev => prev ? { ...prev, selectedQuestions: prev.selectedQuestions.filter(q => q.id !== questionId) } : null);
  };

  const handleUpdateQuestion = async (questionData: any) => {
     if (!editQuestion) return;
    setLoading(true);
    try {
      const updateData = {
        title: questionData.title, content: questionData.content, type: questionData.type,
        options: questionData.type === 'multiple_choice' ? questionData.options : null,
        correct_answer: questionData.type === 'multiple_choice'
          ? questionData.options.filter((opt: any) => opt.isCorrect).map((opt: any) => opt.id)
          : questionData.correctAnswer,
        category: questionData.category || null, subject: questionData.subject,
        institution: questionData.institution || null, difficulty: questionData.difficulty,
        tags: questionData.tags, points: questionData.points, language: questionData.language,
      };
      const { error } = await supabase.from('questions').update(updateData).eq('id', editQuestion.id);
      if (error) throw error;
      toast({ title: "Sucesso!", description: "Questão atualizada com sucesso." });
      setEditQuestion(null);
      await fetchExamAndQuestions(true); // Força recarregamento
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível atualizar a questão.", variant: "destructive" });
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
        examData, setExamData, allQuestions, toggleQuestionSelection, removeSelectedQuestion,
        loading, isPreparing, setPreviewQuestion, setEditQuestion, handleSave, handlePrepareExams,
        previewExam, generatePDF, generateAllPDFs, toast
    }}>
      <EditExamPageContent />
      <Dialog open={!!previewQuestion} onOpenChange={() => setPreviewQuestion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {previewQuestion && ( <div className="p-4"><h4 className="font-medium mb-2">{previewQuestion.title}</h4><div className="prose" dangerouslySetInnerHTML={{ __html: previewQuestion.content }} /></div> )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editQuestion} onOpenChange={() => setEditQuestion(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {editQuestion && ( <QuestionEditor initialData={{ title: editQuestion.title, content: typeof editQuestion.content === 'string' ? editQuestion.content : JSON.stringify(editQuestion.content), type: editQuestion.type as 'multiple_choice' | 'true_false' | 'essay', options: editQuestion.type === 'multiple_choice' && Array.isArray(editQuestion.options) ? editQuestion.options.map((opt: any) => ({ id: opt.id, text: opt.text, isCorrect: Array.isArray(editQuestion.correct_answer) ? editQuestion.correct_answer.includes(opt.id) : false, })) : [], correctAnswer: editQuestion.correct_answer, category: editQuestion.category || '', subject: editQuestion.subject, difficulty: editQuestion.difficulty === 'custom' ? 'medium' : editQuestion.difficulty as 'easy' | 'medium' | 'hard', tags: editQuestion.tags || [], points: editQuestion.points, }} onSave={handleUpdateQuestion} loading={loading} /> )}
        </DialogContent>
      </Dialog>
    </ExamEditorContext.Provider>
  );
}