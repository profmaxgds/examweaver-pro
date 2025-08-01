import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, FileText, Brain, Check, X, RotateCcw } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { HandwrittenOCR } from './HandwrittenOCR';

interface Question {
  id: string;
  title: string;
  content: any;
  correct_answer: string;
  points: number;
}

interface EssayQuestionCorrectionProps {
  question: Question;
  studentAnswer?: string;
  onScoreSubmit: (questionId: string, score: number, feedback: string, extractedText?: string) => void;
  onSkip: () => void;
}

export function EssayQuestionCorrection({ 
  question, 
  studentAnswer, 
  onScoreSubmit, 
  onSkip 
}: EssayQuestionCorrectionProps) {
  const { toast } = useToast();
  const [extractedText, setExtractedText] = useState(studentAnswer || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [manualScore, setManualScore] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [suggestionScore, setSuggestionScore] = useState<number | null>(null);
  const [suggestionFeedback, setSuggestionFeedback] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Função para calcular similaridade entre textos
  const calculateTextSimilarity = useCallback((text1: string, text2: string): number => {
    if (!text1 || !text2) return 0;
    
    const normalize = (str: string) => 
      str.toLowerCase()
         .replace(/[^\w\s]/gi, '')
         .replace(/\s+/g, ' ')
         .trim();

    const normalizedText1 = normalize(text1);
    const normalizedText2 = normalize(text2);
    
    if (normalizedText1 === normalizedText2) return 100;
    
    // Algoritmo de similaridade por palavras
    const words1 = normalizedText1.split(' ');
    const words2 = normalizedText2.split(' ');
    
    let matchingWords = 0;
    const totalWords = Math.max(words1.length, words2.length);
    
    for (const word1 of words1) {
      if (words2.includes(word1)) {
        matchingWords++;
      }
    }
    
    // Similaridade baseada em subsequências comuns
    const lcs = longestCommonSubsequence(normalizedText1, normalizedText2);
    const lcsScore = (lcs.length * 2) / (normalizedText1.length + normalizedText2.length);
    
    // Combinação dos dois métodos
    const wordScore = matchingWords / totalWords;
    const finalScore = (wordScore * 0.6 + lcsScore * 0.4) * 100;
    
    return Math.round(Math.min(finalScore, 100));
  }, []);

  // Algoritmo de Longest Common Subsequence
  const longestCommonSubsequence = (str1: string, str2: string): string => {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // Reconstruir a subsequência
    let lcs = '';
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (str1[i - 1] === str2[j - 1]) {
        lcs = str1[i - 1] + lcs;
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    
    return lcs;
  };

  // Gerar sugestão de pontuação baseada na similaridade
  const generateSuggestion = useCallback(() => {
    if (!extractedText || !question.correct_answer) return;
    
    const similarity = calculateTextSimilarity(extractedText, question.correct_answer);
    const maxPoints = question.points;
    
    // Sistema de pontuação mais maleável
    let scorePercentage;
    if (similarity >= 90) scorePercentage = 100;
    else if (similarity >= 80) scorePercentage = 90;
    else if (similarity >= 70) scorePercentage = 80;
    else if (similarity >= 60) scorePercentage = 70;
    else if (similarity >= 50) scorePercentage = 60;
    else if (similarity >= 40) scorePercentage = 50;
    else if (similarity >= 30) scorePercentage = 40;
    else if (similarity >= 20) scorePercentage = 30;
    else if (similarity >= 10) scorePercentage = 20;
    else scorePercentage = 10;
    
    const suggestedScore = Math.round((scorePercentage / 100) * maxPoints * 10) / 10;
    
    setSuggestionScore(suggestedScore);
    setManualScore(suggestedScore);
    
    let feedback = `Similaridade com gabarito: ${similarity}%\n`;
    if (similarity >= 80) {
      feedback += "Resposta muito próxima ao gabarito esperado.";
    } else if (similarity >= 60) {
      feedback += "Resposta parcialmente correta, contém elementos do gabarito.";
    } else if (similarity >= 40) {
      feedback += "Resposta com alguns pontos corretos, mas incompleta.";
    } else {
      feedback += "Resposta distante do gabarito esperado.";
    }
    
    setSuggestionFeedback(feedback);
    setFeedback(feedback);
  }, [extractedText, question.correct_answer, question.points, calculateTextSimilarity]);

  // OCR para extrair texto da imagem
  const processImageWithOCR = async (file: File) => {
    setIsProcessing(true);
    setProcessingProgress(0);
    
    try {
      toast({
        title: "Processando imagem...",
        description: "Extraindo texto manuscrito, aguarde.",
      });

      const result = await Tesseract.recognize(
        file,
        'por',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              setProcessingProgress(Math.round(m.progress * 100));
            }
          }
        }
      );
      
      const text = result.data.text.trim();
      setExtractedText(text);
      
      toast({
        title: "Texto extraído com sucesso!",
        description: "Revise o texto e ajuste se necessário.",
      });
      
    } catch (error) {
      console.error('Erro no OCR:', error);
      toast({
        title: "Erro ao processar imagem",
        description: "Não foi possível extrair o texto. Tente outra imagem.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      processImageWithOCR(file);
    }
  };

  const handleSubmitScore = () => {
    if (manualScore < 0 || manualScore > question.points) {
      toast({
        title: "Pontuação inválida",
        description: `A pontuação deve estar entre 0 e ${question.points}`,
        variant: "destructive",
      });
      return;
    }
    
    onScoreSubmit(question.id, manualScore, feedback, extractedText);
  };

  // Renderizar conteúdo da questão
  const renderQuestionContent = () => {
    if (typeof question.content === 'string') {
      return question.content;
    }
    if (question.content?.text) {
      return question.content.text;
    }
    if (question.content?.statement) {
      return question.content.statement;
    }
    return 'Conteúdo da questão não disponível';
  };

  return (
    <div className="space-y-6">
      {/* Questão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{question.title}</span>
            <Badge variant="outline">{question.points} pts</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Enunciado:</h4>
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderQuestionContent() }}
              />
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Resposta Esperada:</h4>
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm">{question.correct_answer}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Componente OCR Avançado */}
      <HandwrittenOCR
        question={question}
        onTextExtracted={(text) => {
          setExtractedText(text);
          // Gerar sugestão automaticamente após extrair texto
          setTimeout(() => {
            if (text && question.correct_answer) {
              const similarity = calculateTextSimilarity(text, question.correct_answer);
              const maxPoints = question.points;
              
              let scorePercentage;
              if (similarity >= 90) scorePercentage = 100;
              else if (similarity >= 80) scorePercentage = 90;
              else if (similarity >= 70) scorePercentage = 80;
              else if (similarity >= 60) scorePercentage = 70;
              else if (similarity >= 50) scorePercentage = 60;
              else if (similarity >= 40) scorePercentage = 50;
              else if (similarity >= 30) scorePercentage = 40;
              else if (similarity >= 20) scorePercentage = 30;
              else if (similarity >= 10) scorePercentage = 20;
              else scorePercentage = 10;
              
              const suggestedScore = Math.round((scorePercentage / 100) * maxPoints * 10) / 10;
              
              setSuggestionScore(suggestedScore);
              setManualScore(suggestedScore);
              
              let feedback = `Similaridade com gabarito: ${similarity}%\n`;
              if (similarity >= 80) {
                feedback += "Resposta muito próxima ao gabarito esperado.";
              } else if (similarity >= 60) {
                feedback += "Resposta parcialmente correta, contém elementos do gabarito.";
              } else if (similarity >= 40) {
                feedback += "Resposta com alguns pontos corretos, mas incompleta.";
              } else {
                feedback += "Resposta distante do gabarito esperado.";
              }
              
              setSuggestionFeedback(feedback);
              setFeedback(feedback);
            }
          }, 500);
        }}
        isProcessing={isProcessing}
      />

      {/* Texto editável */}
      {extractedText && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Resposta Extraída
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <label className="text-sm font-medium">Texto do Aluno (editável):</label>
              <Textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                placeholder="Cole ou digite a resposta do aluno aqui..."
                rows={6}
                className="mt-1"
              />
              
              {/* Sugestão automática */}
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={generateSuggestion}
                  className="flex items-center gap-2"
                >
                  <Brain className="w-4 h-4" />
                  Regenerar Sugestão
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pontuação */}
      <Card>
        <CardHeader>
          <CardTitle>Avaliação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sugestão */}
          {suggestionScore !== null && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                Sugestão Automática: {suggestionScore}/{question.points} pts
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">{suggestionFeedback}</p>
            </div>
          )}

          {/* Pontuação manual */}
          <div>
            <label className="text-sm font-medium">
              Pontuação Final (0 a {question.points}):
            </label>
            <input
              type="number"
              min="0"
              max={question.points}
              step="0.1"
              value={manualScore}
              onChange={(e) => setManualScore(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-2 border border-input rounded-md"
            />
          </div>

          {/* Feedback */}
          <div>
            <label className="text-sm font-medium">Comentários/Justificativa:</label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Adicione comentários sobre a correção..."
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Ações */}
          <Separator />
          <div className="flex gap-3">
            <Button onClick={handleSubmitScore} className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              Salvar Pontuação
            </Button>
            <Button variant="outline" onClick={onSkip} className="flex items-center gap-2">
              <X className="w-4 h-4" />
              Pular Questão
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}