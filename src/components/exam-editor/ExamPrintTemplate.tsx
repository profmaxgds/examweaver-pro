import QRCode from 'qrcode';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import { ExamEditorContext } from './context';
import { EditExamPageContent } from './EditExamPageContent';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { QuestionEditor } from './QuestionEditor';

interface Question {
  id: string;
  title: string;
  content: any;
  type: 'multiple_choice' | 'true_false' | 'essay';
  subject: string;
  category: string | null;
  difficulty: string;
  tags: string[];
  points: number;
  options: { id: string; text: string }[] | null;
  correct_answer: any; // Array para múltipla escolha, booleano para V/F, null para dissertativa
  text_lines?: number; // Número de linhas para questões dissertativas
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
  header_id: string | null;
  qr_enabled: boolean;
  time_limit: number | null;
  generation_mode: 'versions' | 'class';
  target_class_id: string | null;
}

// Função de embaralhamento determinístico
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
      }
      if (allQsError) throw allQsError;
      
      const currentQuestions = (allQs || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options.map((opt: any) => ({
          id: opt.id || opt,
          text: opt.text || opt
        })) : q.type === 'true_false' ? null : null, // Garantir que V/F não tenha options
        correct_answer: q.type === 'essay' ? null : q.correct_answer, // Forçar null para dissertativas
        text_lines: q.type === 'essay' ? (q.text_lines || 5) : undefined // Definir padrão para dissertativas
      })) as Question[];
      setAllQuestions(currentQuestions);

      const selectedQs = currentQuestions.filter(q => exam.question_ids.includes(q.id));

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
      toast({ title: "Erro", description: "Erro ao carregar a prova ou questões.", variant: "destructive" });
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
          } else if (q.type === 'true_false') {
            answer_key[q.id] = q.correct_answer; // Booleano para V/F
          }
          // Questões dissertativas não entram no answer_key
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

  const createVersionAnswerKey = async (version: number) => {
    if (!examData || !user) return;

    const { data: existing } = await supabase
      .from('student_exams')
      .select('id')
      .eq('exam_id', examData.id)
      .eq('student_id', `version-${version}`)
      .eq('author_id', user.id)
      .single();

    if (existing) return;

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
      } else if (q.type === 'true_false') {
        answer_key[q.id] = q.correct_answer; // Booleano para V/F
      }
      // Questões dissertativas não entram no answer_key
    });

    await supabase.from('student_exams').insert({
      exam_id: examData.id,
      student_id: `version-${version}`,
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
      return response.data;
    } else {
      return response.data.html;
    }
  };

  const generatePDF = async (id: string | number, includeAnswers: boolean = false) => {
    if (!examData) return;
    setLoading(true);
    try {
      if (typeof id === 'number' && !includeAnswers) {
        await createVersionAnswerKey(id);
      }

      const payload = typeof id === 'string'
        ? { studentExamId: id, includeAnswers }
        : { examId: examData.id, version: id, includeAnswers };

      const response = await supabase.functions.invoke('generate-pdf', { 
        body: { ...payload, generatePDF: true } 
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data && typeof response.data === 'string') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(response.data);
          printWindow.document.close();
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

    } catch (error: any) {
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
      
      const html = await callGeneratePdfFunction(payload, false);
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
      // Validar text_lines para questões dissertativas
      const textLines = questionData.type === 'essay' ? (Number.isInteger(questionData.textLines) && questionData.textLines > 0 ? questionData.textLines : 5) : null;

      // Validar correct_answer para questões V/F
      const correctAnswer = questionData.type === 'multiple_choice'
        ? questionData.options.filter((opt: any) => opt.isCorrect).map((opt: any) => opt.id)
        : questionData.type === 'true_false'
          ? (questionData.correctAnswer === true || questionData.correctAnswer === false ? questionData.correctAnswer : null)
          : null;

      const updateData = {
        title: questionData.title,
        content: questionData.content,
        type: questionData.type,
        options: questionData.type === 'multiple_choice' ? questionData.options : null, // Forçar null para V/F e dissertativas
        correct_answer: correctAnswer,
        category: questionData.category || null,
        subject: questionData.subject,
        institution: questionData.institution || null,
        difficulty: questionData.difficulty,
        tags: questionData.tags,
        points: questionData.points,
        language: questionData.language,
        text_lines: textLines
      };

      const { error } = await supabase.from('questions').update(updateData).eq('id', editQuestion.id);
      if (error) throw error;
      toast({ title: "Sucesso!", description: "Questão atualizada com sucesso." });
      setEditQuestion(null);
      await fetchExamAndQuestions(true);
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
      examData, 
      setExamData, 
      allQuestions, 
      toggleQuestionSelection, 
      removeSelectedQuestion,
      loading, 
      isPreparing, 
      setPreviewQuestion, 
      setEditQuestion, 
      handleSave, 
      handlePrepareExams,
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
                options: editQuestion.type === 'multiple_choice' && Array.isArray(editQuestion.options) 
                  ? editQuestion.options.map((opt: any) => ({ 
                      id: opt.id, 
                      text: opt.text, 
                      isCorrect: Array.isArray(editQuestion.correct_answer) ? editQuestion.correct_answer.includes(opt.id) : false 
                    })) 
                  : [], 
                correctAnswer: editQuestion.correct_answer, 
                category: editQuestion.category || '', 
                subject: editQuestion.subject, 
                difficulty: editQuestion.difficulty === 'custom' ? 'medium' : editQuestion.difficulty as 'easy' | 'medium' | 'hard', 
                tags: editQuestion.tags || [], 
                points: editQuestion.points, 
                textLines: editQuestion.text_lines || (editQuestion.type === 'essay' ? 5 : undefined) // Definir padrão para dissertativas
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