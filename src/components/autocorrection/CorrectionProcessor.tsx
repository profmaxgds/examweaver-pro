import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Loader2, Save, PenTool, AlertTriangle, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { EssayQuestionCorrection } from '@/components/EssayQuestionCorrection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CorrectionProcessorProps {
  selectedFile: File | null;
  examInfo: any | null;
  step: 'upload' | 'qr-scan' | 'photo-capture' | 'scan-marks' | 'corrected' | 'essay-correction';
  setStep: (step: string) => void;
  resetToStart: () => void;
}

interface CorrectionResult {
  examId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  percentage: number;
  correctAnswers: Record<string, string>;
  feedback: Array<{
    questionNumber: string;
    questionId?: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    points?: number;
    earnedPoints?: number;
  }>;
  hasOpenQuestions?: boolean;
  openQuestions?: any[];
}

export function CorrectionProcessor({ selectedFile, examInfo, step, setStep, resetToStart }: CorrectionProcessorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [essayQuestions, setEssayQuestions] = useState<any[]>([]);
  const [currentEssayIndex, setCurrentEssayIndex] = useState(0);
  const [essayScores, setEssayScores] = useState<Record<string, { score: number; feedback: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});
  const [isEditMode, setIsEditMode] = useState(false); // Novo estado para modo de edição

  useEffect(() => {
    if (selectedFile && !correctionResult && step === 'scan-marks') {
      processCorrection();
    }
  }, [selectedFile, step]);

  const processCorrection = async () => {
    if (!selectedFile || !user || !examInfo) {
      toast({ title: "Erro", description: "Arquivo ou dados do exame não encontrados.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    setStep('scan-marks');
    try {
      const fileName = `${user.id}/correction_${Date.now()}_${selectedFile.name}`;
      await supabase.storage.from('correction-scans').upload(fileName, selectedFile);

      const { data: ocrResult } = await supabase.functions.invoke('ocr-correction', {
        body: {
          fileName,
          mode: 'coordinate_based',
          examInfo: {
            examId: examInfo.examId,
            studentId: examInfo.studentId,
            answerKey: examInfo.answerKey || {},
            bubbleCoordinates: examInfo.bubbleCoordinates || {},
          },
        },
      });

      if (!ocrResult) throw new Error('Nenhum resultado de OCR retornado.');

      const correctionData: CorrectionResult = {
        examId: examInfo.examId,
        studentId: examInfo.studentId,
        studentName: examInfo.studentName || 'Aluno',
        answers: ocrResult.detectedAnswers || {},
        score: ocrResult.score || 0,
        maxScore: ocrResult.maxScore || 0,
        percentage: Math.round((ocrResult.score || 0) / (ocrResult.maxScore || 1) * 100),
        correctAnswers: examInfo.answerKey || {},
        feedback: ocrResult.feedback || [],
        hasOpenQuestions: ocrResult.hasOpenQuestions || false,
        openQuestions: ocrResult.openQuestions || [],
      };

      setCorrectionResult(correctionData);
      setEssayQuestions(ocrResult.openQuestions || []);
      setStep('corrected');
      toast({ title: "✅ Correção Concluída!", description: `Nota: ${correctionData.score}/${correctionData.maxScore} (${correctionData.percentage}%)` });
      if (correctionData.hasOpenQuestions) {
        toast({ title: "⚠️ Questões Abertas", description: `${correctionData.openQuestions.length} questão(ões) aberta(s) precisam ser corrigidas.` });
      }
    } catch (error) {
      toast({ title: "Erro", description: (error as Error).message || 'Erro ao processar correção.', variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEssayScore = (questionId: string, score: number, feedback: string) => {
    setEssayScores(prev => ({ ...prev, [questionId]: { score, feedback } }));
    if (currentEssayIndex < essayQuestions.length - 1) {
      setCurrentEssayIndex(prev => prev + 1);
    } else {
      finalizeCorrectionWithEssays();
    }
  };

  const skipEssayQuestion = () => {
    if (currentEssayIndex < essayQuestions.length - 1) {
      setCurrentEssayIndex(prev => prev + 1);
    } else {
      finalizeCorrectionWithEssays();
    }
  };

  const finalizeCorrectionWithEssays = () => {
    if (!correctionResult) return;
    let totalEssayScore = 0, totalEssayMaxScore = 0;
    essayQuestions.forEach(q => {
      totalEssayMaxScore += q.points;
      if (essayScores[q.id]) totalEssayScore += essayScores[q.id].score;
    });
    const finalScore = correctionResult.score + totalEssayScore;
    const finalMaxScore = correctionResult.maxScore + totalEssayMaxScore;
    setCorrectionResult(prev => prev ? {
      ...prev,
      score: finalScore,
      maxScore: finalMaxScore,
      percentage: Math.round((finalScore / finalMaxScore) * 100),
      essayScores
    } : null);
    setStep('corrected');
    toast({ title: "Correção Finalizada!", description: `Pontuação: ${finalScore}/${finalMaxScore} (${((finalScore / finalMaxScore) * 100).toFixed(1)}%)` });
  };

  const saveCorrection = async () => {
    if (!correctionResult || !user) return;
    setIsSaving(true);
    try {
      const correctionData = {
        exam_id: correctionResult.examId,
        student_identification: correctionResult.studentId,
        student_name: correctionResult.studentName,
        answers: { ...correctionResult.answers, ...editedAnswers, essay_scores: essayScores },
        score: correctionResult.score,
        max_score: correctionResult.maxScore,
        percentage: correctionResult.percentage,
        auto_corrected: !correctionResult.hasOpenQuestions,
        author_id: user.id,
        image_url: selectedFile ? `correction_${Date.now()}_${selectedFile.name}` : null,
      };
      await supabase.from('exam_corrections').insert(correctionData);
      toast({ title: "Sucesso!", description: "Correção salva." });
      resetToStart();
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível salvar a correção.", variant: "destructive" });
    } finally {
      setIsSaving(false);
      setIsEditMode(false); // Desativa o modo de edição após salvar
    }
  };

  const handleEditAnswer = (questionNumber: string, newAnswer: string) => {
    setEditedAnswers(prev => ({ ...prev, [questionNumber]: newAnswer }));
    if (correctionResult) {
      const updatedFeedback = correctionResult.feedback.map(f =>
        f.questionNumber === questionNumber ? {
          ...f,
          studentAnswer: newAnswer,
          isCorrect: newAnswer === correctionResult.correctAnswers[questionNumber],
          earnedPoints: newAnswer === correctionResult.correctAnswers[questionNumber] ? f.points : 0
        } : f
      );
      const newScore = updatedFeedback.reduce((sum, f) => sum + (f.earnedPoints || 0), 0);
      setCorrectionResult(prev => prev ? {
        ...prev,
        feedback: updatedFeedback,
        score: newScore,
        percentage: Math.round((newScore / prev.maxScore) * 100)
      } : null);
      toast({ title: "Editado!", description: `Resposta da questão ${questionNumber} atualizada.` });
    }
  };

  const handleSelectAnswer = (questionNumber: string, value: string) => {
    handleEditAnswer(questionNumber, value);
  };

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
    if (!isEditMode) {
      // Quando entra no modo de edição, reseta editedAnswers para os valores originais
      const initialAnswers = correctionResult?.feedback.reduce((acc: Record<string, string>, item) => ({
        ...acc,
        [item.questionNumber]: item.studentAnswer
      }), {});
      setEditedAnswers(initialAnswers || {});
    }
  };

  const saveEdits = () => {
    if (correctionResult) {
      const updatedFeedback = correctionResult.feedback.map(f => ({
        ...f,
        studentAnswer: editedAnswers[f.questionNumber] || f.studentAnswer,
        isCorrect: (editedAnswers[f.questionNumber] || f.studentAnswer) === correctionResult.correctAnswers[f.questionNumber],
        earnedPoints: (editedAnswers[f.questionNumber] || f.studentAnswer) === correctionResult.correctAnswers[f.questionNumber] ? f.points : 0
      }));
      const newScore = updatedFeedback.reduce((sum, f) => sum + (f.earnedPoints || 0), 0);
      setCorrectionResult(prev => prev ? {
        ...prev,
        feedback: updatedFeedback,
        score: newScore,
        percentage: Math.round((newScore / prev.maxScore) * 100)
      } : null);
      setIsEditMode(false); // Sai do modo de edição após salvar
      toast({ title: "Edições Salvas!", description: "As alterações foram aplicadas com sucesso." });
    }
  };

  return (
    <>
      {step === 'corrected' && correctionResult && (
        <Card className="border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" /> Resultado da Correção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg text-center space-y-2">
              <div className="text-3xl font-bold text-green-700 dark:text-green-300">{correctionResult.score}/{correctionResult.maxScore}</div>
              <div className="text-xl text-green-600 dark:text-green-400">{correctionResult.percentage}%</div>
              <p className="text-sm text-green-600 dark:text-green-400">{correctionResult.hasOpenQuestions ? 'Pontuação parcial (questões fechadas)' : 'Pontuação final'}</p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold">Detalhes das Questões:</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {correctionResult.feedback.map((item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${item.isCorrect ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-medium">Questão {item.questionNumber}</span>
                      <input
                        type="text"
                        value={isEditMode ? (editedAnswers[item.questionNumber] || item.studentAnswer) : item.studentAnswer}
                        onChange={(e) => isEditMode && handleEditAnswer(item.questionNumber, e.target.value)}
                        className="w-20 p-1 border rounded"
                        disabled={!isEditMode}
                        placeholder="Digite a resposta"
                      />
                      <Select
                        value={isEditMode ? (editedAnswers[item.questionNumber] || item.studentAnswer) : item.studentAnswer}
                        onValueChange={(value) => isEditMode && handleSelectAnswer(item.questionNumber, value)}
                        disabled={!isEditMode}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                          <SelectItem value="E">E</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <p>Gabarito: {item.correctAnswer}</p>
                      <p>Pontos: {item.earnedPoints}/{item.points}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {selectedFile && (
              <div className="mt-4">
                <img src={URL.createObjectURL(selectedFile)} alt="Imagem usada" className="w-full max-w-md mx-auto rounded-lg border" />
              </div>
            )}
            {correctionResult.hasOpenQuestions && essayQuestions.length > 0 && (
              <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-700">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{essayQuestions.length} questão(ões) aberta(s) precisam ser corrigidas.</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-4">
              <Button
                variant="outline"
                onClick={toggleEditMode}
                className={isEditMode ? 'bg-yellow-500 text-white hover:bg-yellow-600' : ''}
              >
                <Edit className="w-4 h-4 mr-2" /> {isEditMode ? 'Cancelar Edição' : 'Editar Respostas'}
              </Button>
              {isEditMode && (
                <Button
                  variant="default"
                  onClick={saveEdits}
                >
                  <Save className="w-4 h-4 mr-2" /> Salvar Edições
                </Button>
              )}
              {correctionResult.hasOpenQuestions && essayQuestions.length > 0 && (
                <Button variant="secondary" onClick={() => setStep('essay-correction')}>
                  <PenTool className="w-4 h-4 mr-2" /> Corrigir Abertas
                </Button>
              )}
              <Button
                variant="default"
                disabled={isSaving}
                onClick={saveCorrection}
              >
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Correção</>}
              </Button>
              <Button variant="outline" onClick={resetToStart}>
                Nova Correção
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {step === 'essay-correction' && essayQuestions.length > 0 && (
        <Card className="border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="w-5 h-5" /> Correção de Questões Abertas
              <span className="text-sm text-muted-foreground">{currentEssayIndex + 1}/{essayQuestions.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EssayQuestionCorrection question={essayQuestions[currentEssayIndex]} onScoreSubmit={handleEssayScore} onSkip={skipEssayQuestion} />
          </CardContent>
        </Card>
      )}
      {step === 'scan-marks' && (
        <Card className="border bg-card text-card-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Processando Marcações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center text-sm text-muted-foreground">Analisando marcações...</div>
          </CardContent>
        </Card>
      )}
    </>
  );
}