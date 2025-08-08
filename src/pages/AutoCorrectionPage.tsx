import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LayoutExtractor } from '@/components/autocorrection/LayoutExtractor';
import { LiveCorrector } from '@/components/autocorrection/LiveCorrector';
import { AnswerEditor } from '@/components/autocorrection/AnswerEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Camera, Edit, CheckCircle } from 'lucide-react';

interface Exam {
  id: string;
  title: string;
  subject: string;
  question_ids: string[];
  answer_sheet?: any;
}

interface LayoutData {
  pageDimensions: any;
  bubbleDimensions: any;
  fieldBlocks: Record<string, any>;
  anchors: any[];
}

interface CorrectionResults {
  [questionId: string]: {
    correctAnswer: string;
    detectedAnswer: string;
    status: 'CORRETA' | 'ERRADA' | 'ANULADA';
    confidence: number;
  };
}

export default function AutoCorrectionPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<'select' | 'extract' | 'correct' | 'edit'>('select');
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [examHtml, setExamHtml] = useState<string>('');
  const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, string>>({});
  const [correctionResults, setCorrectionResults] = useState<CorrectionResults | null>(null);
  const [screenshots, setScreenshots] = useState<{ feedback: string; original: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Carregar exames do usuário
  useEffect(() => {
    if (user) {
      loadExams();
    }
  }, [user]);

  const loadExams = async () => {
    try {
      const { data } = await supabase
        .from('exams')
        .select('id, title, subject, question_ids, answer_sheet')
        .eq('author_id', user?.id)
        .order('created_at', { ascending: false });

      setExams(data || []);
    } catch (error) {
      toast.error('Erro ao carregar exames');
    }
  };

  const handleExamSelect = async (examId: string) => {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;

    setLoading(true);
    try {
      // Buscar HTML do gabarito do banco
      const { data: studentExams } = await supabase
        .from('student_exams')
        .select('html_content, answer_key')
        .eq('exam_id', examId)
        .limit(1);

      if (studentExams && studentExams[0]?.html_content) {
        setExamHtml(studentExams[0].html_content);
        // Safely handle Json type from Supabase
        const answerKey = studentExams[0].answer_key;
        if (answerKey && typeof answerKey === 'object' && !Array.isArray(answerKey)) {
          const typedAnswers: Record<string, string> = {};
          Object.entries(answerKey).forEach(([key, value]) => {
            if (typeof value === 'string') {
              typedAnswers[key] = value;
            }
          });
          setCorrectAnswers(typedAnswers);
        } else {
          setCorrectAnswers({});
        }
      } else {
        // Se não tem HTML, buscar as questões e montar gabarito
        const { data: questions } = await supabase
          .from('questions')
          .select('*')
          .in('id', exam.question_ids);

        const answers: Record<string, string> = {};
        questions?.forEach((q, index) => {
          // Safely handle Json type from correct_answer
          const correctAnswer = q.correct_answer;
          if (typeof correctAnswer === 'string') {
            answers[`Q${index + 1}`] = correctAnswer;
          } else if (correctAnswer && typeof correctAnswer === 'object' && !Array.isArray(correctAnswer)) {
            // If correct_answer is an object, try to extract the answer
            const answerValue = (correctAnswer as any).answer || (correctAnswer as any).value || '';
            if (typeof answerValue === 'string') {
              answers[`Q${index + 1}`] = answerValue;
            }
          }
        });
        setCorrectAnswers(answers);
      }

      setSelectedExam(exam);
      setCurrentStep('extract');
    } catch (error) {
      toast.error('Erro ao carregar dados do exame');
    } finally {
      setLoading(false);
    }
  };

  const handleLayoutExtracted = (layout: LayoutData) => {
    setLayoutData(layout);
    setCurrentStep('correct');
    toast.success('Layout extraído com sucesso!');
  };

  const handleCorrectionComplete = (results: CorrectionResults, screenshots: { feedback: string; original: string }) => {
    setCorrectionResults(results);
    setScreenshots(screenshots);
    setCurrentStep('edit');
    toast.success('Correção concluída!');
  };

  const handleSaveCorrection = async (finalResults: CorrectionResults) => {
    if (!selectedExam) return;

    setLoading(true);
    try {
      const score = Object.values(finalResults).filter(r => r.status === 'CORRETA').length;
      const maxScore = Object.keys(finalResults).length;
      const percentage = (score / maxScore) * 100;

      const correctionData = {
        exam_id: selectedExam.id,
        student_name: 'Correção Automática',
        answers: finalResults,
        score,
        max_score: maxScore,
        percentage,
        auto_corrected: true,
        confidence_score: Object.values(finalResults).reduce((acc, r) => acc + r.confidence, 0) / Object.keys(finalResults).length,
        author_id: user?.id
      };

      await supabase.from('exam_corrections').insert(correctionData);
      
      toast.success('Correção salva com sucesso!');
      handleReset();
    } catch (error) {
      toast.error('Erro ao salvar correção');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCurrentStep('select');
    setSelectedExam(null);
    setExamHtml('');
    setLayoutData(null);
    setCorrectAnswers({});
    setCorrectionResults(null);
    setScreenshots(null);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {currentStep !== 'select' && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-3xl font-bold">Auto Correção Inteligente</h1>
        </div>
        
        {/* Indicador de progresso */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            currentStep === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <FileText className="w-4 h-4" />
            Selecionar
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            currentStep === 'extract' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <FileText className="w-4 h-4" />
            Extrair Layout
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            currentStep === 'correct' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <Camera className="w-4 h-4" />
            Corrigir
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            currentStep === 'edit' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <Edit className="w-4 h-4" />
            Editar
          </div>
        </div>
      </div>

      {/* Etapa 1: Selecionar Exame */}
      {currentStep === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Selecionar Exame para Correção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Escolha um exame:
                </label>
                <Select onValueChange={handleExamSelect} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um exame..." />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map(exam => (
                      <SelectItem key={exam.id} value={exam.id}>
                        {exam.title} - {exam.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {exams.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum exame encontrado.</p>
                  <p className="text-sm">Crie um exame primeiro para usar a auto-correção.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 2: Extrair Layout */}
      {currentStep === 'extract' && selectedExam && (
        <LayoutExtractor 
          htmlContent={examHtml} 
          onLayoutExtracted={handleLayoutExtracted}
        />
      )}

      {/* Etapa 3: Correção ao Vivo */}
      {currentStep === 'correct' && layoutData && (
        <LiveCorrector
          layoutData={layoutData}
          correctAnswers={correctAnswers}
          onCorrectionComplete={handleCorrectionComplete}
        />
      )}

      {/* Etapa 4: Editar Respostas */}
      {currentStep === 'edit' && correctionResults && screenshots && (
        <AnswerEditor
          results={correctionResults}
          screenshots={screenshots}
          availableOptions={['A', 'B', 'C', 'D', 'E']}
          onSave={handleSaveCorrection}
          onCancel={handleReset}
        />
      )}
    </div>
  );
}