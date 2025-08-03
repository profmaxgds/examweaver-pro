import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  Camera, 
  Upload, 
  QrCode, 
  Loader2, 
  Target, 
  Play, 
  Pause, 
  CheckCircle, 
  Save, 
  ArrowLeft, 
  AlertTriangle, 
  Info 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';

// Interfaces para tipagem
interface QRCodeData {
  examId: string;
  studentId: string;
  version: number;
  studentExamId: string | null;
}

interface ExamData {
  id: string;
  title: string;
  subject: string;
  layout: string;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  qr_enabled: boolean;
  header_id?: string;
}

interface StudentExam {
  id: string;
  shuffled_question_ids: string[];
  shuffled_options_map: Record<string, string[]>;
  answer_key: Record<string, any>;
  bubble_coordinates: Record<string, Record<string, { x: number; y: number }>>;
  exam: ExamData;
  student?: {
    name: string;
    student_id: string;
    course?: string;
    class?: { name: string };
  };
}

interface Question {
  id: string;
  title: string;
  content: any;
  type: string;
  options?: Array<{ id: string; text: string; letter?: string }>;
  correct_answer: any;
  points: number;
}

interface DetectedAnswer {
  questionNumber: string;
  selectedOption: string;
  confidence: number;
  isCorrect: boolean;
  expectedAnswer: string;
  coordinates: { x: number; y: number };
}

interface CorrectionResult {
  examId: string;
  studentExamId: string;
  studentName: string;
  answers: Record<string, any>;
  detectedAnswers: DetectedAnswer[];
  score: number;
  maxScore: number;
  percentage: number;
  timestamp: Date;
}

export default function AutoCorrectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Estados principais
  const [step, setStep] = useState<'upload' | 'qr-scan' | 'real-time-correction' | 'correction-complete'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  
  // Estados da câmera e correção em tempo real
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRealTimeCorrection, setIsRealTimeCorrection] = useState(false);
  const [studentExamData, setStudentExamData] = useState<StudentExam | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [detectedAnswers, setDetectedAnswers] = useState<DetectedAnswer[]>([]);
  const [currentScore, setCurrentScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const correctionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Limpeza ao desmontar componente
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      if (correctionIntervalRef.current) {
        clearInterval(correctionIntervalRef.current);
      }
    };
  }, [cameraStream]);

  // Função para acessar câmera
  const startCamera = async () => {
    try {
      console.log('🎥 Iniciando câmera para escaneamento de QR code...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Câmera traseira preferencialmente
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      setCameraStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        console.log('✅ Câmera iniciada com sucesso');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Erro ao acessar câmera:', error);
      toast({
        title: "Erro na Câmera",
        description: "Não foi possível acessar a câmera. Verifique as permissões.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Função para extrair dados do QR Code
  const extractQRCodeData = (qrCodeText: string): QRCodeData | null => {
    try {
      console.log('📱 Processando QR Code:', qrCodeText);
      
      // Tentar como JSON primeiro
      const data = JSON.parse(qrCodeText);
      
      if (data.examId && data.studentId) {
        console.log('✅ QR Code válido encontrado:', data);
        return {
          examId: data.examId,
          studentId: data.studentId,
          version: data.version || 1,
          studentExamId: data.studentExamId || null
        };
      }
    } catch (error) {
      console.log('⚠️ QR Code não é JSON válido, tentando outros formatos...');
      
      // Tentar outros formatos de QR code
      const patterns = [
        /examId:([^,]+),studentId:([^,]+)/,
        /exam:([^|]+)\|student:([^|]+)/,
        /^([a-f0-9-]{36})-(.+)$/
      ];
      
      for (const pattern of patterns) {
        const match = qrCodeText.match(pattern);
        if (match) {
          console.log('✅ QR Code extraído com padrão:', pattern);
          return {
            examId: match[1],
            studentId: match[2],
            version: 1,
            studentExamId: null
          };
        }
      }
    }
    
    console.log('❌ Formato de QR Code não reconhecido:', qrCodeText);
    return null;
  };

  // Função para buscar dados da prova baseado no QR code
  const fetchExamDataFromQR = async (qrData: QRCodeData) => {
    try {
      console.log('🔍 Buscando dados da prova:', qrData);
      setIsProcessing(true);
      
      // Se temos studentExamId (modo turma), buscar dados específicos
      if (qrData.studentExamId) {
        console.log('📋 Buscando prova específica do aluno:', qrData.studentExamId);
        
        const { data: studentExam, error: studentExamError } = await supabase
          .from('student_exams')
          .select(`
            id,
            shuffled_question_ids,
            shuffled_options_map,
            answer_key,
            bubble_coordinates,
            exam:exams(*),
            student:students(
              name,
              student_id,
              course,
              class:classes(name)
            )
          `)
          .eq('id', qrData.studentExamId)
          .single();

        if (studentExamError) {
          throw new Error(`Prova não encontrada: ${studentExamError.message}`);
        }

        console.log('✅ Dados da prova encontrados:', studentExam);
        
        // Buscar questões na ordem correta
        const { data: questions, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .in('id', studentExam.shuffled_question_ids);

        if (questionsError) {
          throw new Error(`Erro ao buscar questões: ${questionsError.message}`);
        }

        // Ordenar questões conforme shuffle
        const orderedQuestions = studentExam.shuffled_question_ids.map(id => 
          questions.find(q => q.id === id)
        ).filter(Boolean) as any[];

        // Calcular pontuação máxima
        const maxPossibleScore = orderedQuestions.reduce((total, q) => total + (q.points || 1), 0);

        setStudentExamData(studentExam as any);
        setExamQuestions(orderedQuestions);
        setMaxScore(maxPossibleScore);
        setCurrentScore(0);
        setDetectedAnswers([]);

        toast({
          title: "✅ Prova Encontrada!",
          description: `Prova: ${studentExam.exam.title} - Aluno: ${studentExam.student?.name || qrData.studentId}`,
        });

        return true;
      } else {
        // Modo versões - buscar pelo examId e version
        console.log('📄 Buscando versão da prova:', qrData.examId, 'versão:', qrData.version);
        
        const { data: versionExam, error: versionError } = await supabase
          .from('student_exams')
          .select(`
            id,
            shuffled_question_ids,
            shuffled_options_map,
            answer_key,
            bubble_coordinates,
            exam:exams(*)
          `)
          .eq('exam_id', qrData.examId)
          .eq('version_id', `version-${qrData.version}`)
          .is('student_id', null)
          .single();

        if (versionError) {
          throw new Error(`Versão da prova não encontrada: ${versionError.message}`);
        }

        // Buscar questões
        const { data: questions, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .in('id', versionExam.shuffled_question_ids);

        if (questionsError) {
          throw new Error(`Erro ao buscar questões: ${questionsError.message}`);
        }

        const orderedQuestions = versionExam.shuffled_question_ids.map(id => 
          questions.find(q => q.id === id)
        ).filter(Boolean) as any[];

        const maxPossibleScore = orderedQuestions.reduce((total, q) => total + (q.points || 1), 0);

        // Criar studentExam fake para versão
        const fakeStudentExam = {
          ...versionExam,
          student: {
            name: `Versão ${qrData.version}`,
            student_id: qrData.studentId,
            course: 'N/A'
          }
        };

        setStudentExamData(fakeStudentExam as any);
        setExamQuestions(orderedQuestions);
        setMaxScore(maxPossibleScore);
        setCurrentScore(0);
        setDetectedAnswers([]);

        toast({
          title: "✅ Versão Encontrada!",
          description: `Prova: ${versionExam.exam.title} - Versão ${qrData.version}`,
        });

        return true;
      }
    } catch (error: any) {
      console.error('❌ Erro ao buscar dados da prova:', error);
      toast({
        title: "Erro",
        description: error.message || 'Erro ao buscar dados da prova',
        variant: "destructive",
      });
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // Função otimizada para escaneamento de QR code ultra-rápido (baseada no código anterior)
  const scanVideoForQR = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning || step !== 'qr-scan') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Usar resolução muito pequena para máxima velocidade (baseado no código anterior)
    const scanWidth = 320;
    const scanHeight = 240;
    
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    
    // Desenhar com suavização desabilitada para velocidade máxima
    context.imageSmoothingEnabled = false;
    context.drawImage(video, 0, 0, scanWidth, scanHeight);

    const imageData = context.getImageData(0, 0, scanWidth, scanHeight);
    
    // Tentar múltiplas configurações para máxima compatibilidade (como no código anterior)
    const configurations = [
      { inversionAttempts: "dontInvert" as const },
      { inversionAttempts: "onlyInvert" as const },
      { inversionAttempts: "attemptBoth" as const }
    ];

    for (const config of configurations) {
      try {
        const code = jsQR(imageData.data, imageData.width, imageData.height, config);
        
        if (code && code.data && code.data.trim()) {
          console.log('✅ QR code detectado instantaneamente:', code.data);
          setIsScanning(false);
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
          
          // Processar dados do QR code
          const qrData = extractQRCodeData(code.data);
          if (qrData) {
            fetchExamDataFromQR(qrData).then(success => {
              if (success) {
                setStep('real-time-correction');
                startRealTimeCorrection();
              }
            });
          }
          return; // Sair da função após detecção
        }
      } catch (error) {
        // Continuar para próxima configuração
        continue;
      }
    }
  }, [step, isScanning]);

  // Iniciar escaneamento de QR code
  const startQRScanning = async () => {
    setStep('qr-scan');
    const cameraStarted = await startCamera();
    
    if (cameraStarted) {
      setIsScanning(true);
      
      // Aguardar um pouco para o vídeo carregar e reduzir intervalo para leitura mais rápida
      setTimeout(() => {
        scanIntervalRef.current = setInterval(scanVideoForQR, 50); // 20 FPS para leitura mais rápida
      }, 300);

      toast({
        title: "📱 Escaneando QR Code",
        description: "Posicione o QR code da prova na câmera",
      });
    }
  };

  // Função para detectar marcações em tempo real
  const detectAnswerMarks = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !overlayCanvasRef.current || !studentExamData) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const context = canvas.getContext('2d');
    const overlayContext = overlayCanvas.getContext('2d');

    if (!context || !overlayContext || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    // Capturar frame atual
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Limpar overlay anterior
    overlayCanvas.width = video.videoWidth;
    overlayCanvas.height = video.videoHeight;
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const newDetectedAnswers: DetectedAnswer[] = [];

    // Para cada questão, verificar as coordenadas das bolhas
    Object.entries(studentExamData.bubble_coordinates || {}).forEach(([questionNum, bubbles]) => {
      const questionId = studentExamData.shuffled_question_ids[parseInt(questionNum) - 1];
      const question = examQuestions.find(q => q.id === questionId);
      
      if (!question || question.type !== 'multiple_choice') return;

      let bestOption = '';
      let bestConfidence = 0;
      const expectedAnswer = studentExamData.answer_key[questionId];

      // Verificar cada opção da questão
      Object.entries(bubbles as Record<string, { x: number; y: number }>).forEach(([letter, coords]) => {
        // Simular detecção de marca (aqui você implementaria a lógica real de detecção)
        const confidence = detectMarkAtCoordinates(imageData, coords.x, coords.y);
        
        if (confidence > 0.7 && confidence > bestConfidence) {
          bestOption = letter;
          bestConfidence = confidence;
        }

        // Desenhar círculo no overlay para mostrar onde estamos detectando
        overlayContext.beginPath();
        overlayContext.arc(coords.x, coords.y, 15, 0, 2 * Math.PI);
        overlayContext.strokeStyle = confidence > 0.7 ? '#00ff00' : '#ff0000';
        overlayContext.lineWidth = 2;
        overlayContext.stroke();
        
        // Desenhar letra
        overlayContext.fillStyle = confidence > 0.7 ? '#00ff00' : '#ffffff';
        overlayContext.font = '12px Arial';
        overlayContext.fillText(letter, coords.x - 4, coords.y + 4);
      });

      if (bestOption && bestConfidence > 0.7) {
        const isCorrect = Array.isArray(expectedAnswer) 
          ? expectedAnswer.includes(bestOption)
          : expectedAnswer === bestOption;

        newDetectedAnswers.push({
          questionNumber: questionNum,
          selectedOption: bestOption,
          confidence: bestConfidence,
          isCorrect,
          expectedAnswer: Array.isArray(expectedAnswer) ? expectedAnswer.join(',') : expectedAnswer,
          coordinates: bubbles[bestOption] as { x: number; y: number }
        });
      }
    });

    // Atualizar estado com novas respostas detectadas
    setDetectedAnswers(newDetectedAnswers);
    
    // Calcular pontuação atual
    const score = newDetectedAnswers.reduce((total, answer) => {
      if (answer.isCorrect) {
        const questionId = studentExamData.shuffled_question_ids[parseInt(answer.questionNumber) - 1];
        const question = examQuestions.find(q => q.id === questionId);
        return total + (question?.points || 1);
      }
      return total;
    }, 0);
    
    setCurrentScore(score);

  }, [studentExamData, examQuestions]);

  // Função simulada para detectar marca nas coordenadas (implementar com visão computacional real)
  const detectMarkAtCoordinates = (imageData: ImageData, x: number, y: number): number => {
    // Esta é uma implementação simplificada
    // Na implementação real, você usaria algoritmos de visão computacional
    const radius = 10;
    let darkPixels = 0;
    let totalPixels = 0;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        
        if (px >= 0 && px < imageData.width && py >= 0 && py < imageData.height) {
          const index = (py * imageData.width + px) * 4;
          const r = imageData.data[index];
          const g = imageData.data[index + 1];
          const b = imageData.data[index + 2];
          const brightness = (r + g + b) / 3;
          
          if (brightness < 128) darkPixels++;
          totalPixels++;
        }
      }
    }

    return totalPixels > 0 ? darkPixels / totalPixels : 0;
  };

  // Iniciar correção em tempo real
  const startRealTimeCorrection = () => {
    setIsRealTimeCorrection(true);
    
    // Iniciar detecção contínua de marcações
    correctionIntervalRef.current = setInterval(detectAnswerMarks, 200); // Detectar a cada 200ms
    
    toast({
      title: "🎯 Correção em Tempo Real",
      description: "Posicione a folha de respostas na câmera para correção automática",
    });
  };

  // Parar correção em tempo real
  const stopRealTimeCorrection = () => {
    setIsRealTimeCorrection(false);
    
    if (correctionIntervalRef.current) {
      clearInterval(correctionIntervalRef.current);
    }
  };

  // Salvar resultado da correção
  const saveCorrection = async () => {
    if (!studentExamData || !detectedAnswers.length) {
      toast({
        title: "Nenhuma Resposta Detectada",
        description: "Não há respostas suficientes para salvar a correção.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    
    try {
      // Preparar dados da correção
      const answers: Record<string, any> = {};
      detectedAnswers.forEach(answer => {
        const questionId = studentExamData.shuffled_question_ids[parseInt(answer.questionNumber) - 1];
        answers[questionId] = answer.selectedOption;
      });

      const correctionData = {
        exam_id: studentExamData.exam.id,
        student_id: studentExamData.student?.student_id || null,
        student_identification: studentExamData.student?.student_id || 'N/A',
        student_name: studentExamData.student?.name || 'N/A',
        answers,
        score: currentScore,
        max_score: maxScore,
        percentage: maxScore > 0 ? (currentScore / maxScore) * 100 : 0,
        author_id: user?.id,
        auto_corrected: true,
        qr_code_data: JSON.stringify({
          examId: studentExamData.exam.id,
          studentExamId: studentExamData.id
        })
      };

      const { error } = await supabase
        .from('exam_corrections')
        .insert(correctionData);

      if (error) {
        throw new Error(`Erro ao salvar correção: ${error.message}`);
      }

      // Criar resultado final
      const result: CorrectionResult = {
        examId: studentExamData.exam.id,
        studentExamId: studentExamData.id,
        studentName: studentExamData.student?.name || 'N/A',
        answers,
        detectedAnswers,
        score: currentScore,
        maxScore,
        percentage: maxScore > 0 ? (currentScore / maxScore) * 100 : 0,
        timestamp: new Date()
      };

      setCorrectionResult(result);
      setStep('correction-complete');
      stopRealTimeCorrection();

      toast({
        title: "✅ Correção Salva!",
        description: `Resultado: ${currentScore}/${maxScore} (${result.percentage.toFixed(1)}%)`,
      });

    } catch (error: any) {
      console.error('❌ Erro ao salvar correção:', error);
      toast({
        title: "Erro ao Salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Parar câmera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsScanning(false);
    setIsRealTimeCorrection(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (correctionIntervalRef.current) {
      clearInterval(correctionIntervalRef.current);
    }
  };

  // Resetar para início
  const resetToStart = () => {
    stopCamera();
    setStep('upload');
    setStudentExamData(null);
    setExamQuestions([]);
    setDetectedAnswers([]);
    setCurrentScore(0);
    setMaxScore(0);
    setCorrectionResult(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Correção Automática</h1>
            </div>
            
            {step !== 'upload' && (
              <Button variant="outline" onClick={resetToStart}>
                Nova Correção
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Step: Upload/Início */}
        {step === 'upload' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-6 h-6" />
                  Correção Automática em Tempo Real
                </CardTitle>
                <CardDescription>
                  Escaneie o QR code da prova e posicione a folha de respostas para correção automática
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <Button 
                    onClick={startQRScanning}
                    disabled={isProcessing}
                    className="h-16 text-lg"
                  >
                    <Camera className="w-6 h-6 mr-2" />
                    {isProcessing ? 'Processando...' : 'Corrigir Provas'}
                  </Button>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Como funciona:</strong>
                    <br />
                    1. Escaneie o QR code da prova impressa
                    <br />
                    2. Posicione a folha de respostas na câmera
                    <br />
                    3. O sistema detectará automaticamente as marcações
                    <br />
                    4. Veja o resultado em tempo real e salve a correção
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: QR Scan */}
        {step === 'qr-scan' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="w-6 h-6" />
                  Escaneamento de QR Code
                  {isScanning && <Badge variant="secondary">Escaneando...</Badge>}
                </CardTitle>
                <CardDescription>
                  Posicione o QR code da prova na câmera
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  
                  {/* Overlay para mostrar área de escaneamento */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-white border-dashed rounded-lg bg-black/20">
                      <div className="w-full h-full flex items-center justify-center">
                        <QrCode className="w-16 h-16 text-white" />
                      </div>
                    </div>
                  </div>

                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={resetToStart}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Real-time Correction */}
        {step === 'real-time-correction' && studentExamData && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Info da prova */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-6 h-6" />
                  Correção em Tempo Real
                  {isRealTimeCorrection && <Badge variant="secondary">Detectando...</Badge>}
                </CardTitle>
                <CardDescription>
                  {studentExamData.exam.title} - {studentExamData.student?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{currentScore}</div>
                    <div className="text-sm text-muted-foreground">Pontos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{maxScore}</div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {detectedAnswers.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Detectadas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {maxScore > 0 ? ((currentScore / maxScore) * 100).toFixed(1) : 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">Aproveitamento</div>
                  </div>
                </div>

                <Progress 
                  value={maxScore > 0 ? (currentScore / maxScore) * 100 : 0} 
                  className="mt-4" 
                />
              </CardContent>
            </Card>

            {/* Vídeo com overlay */}
            <Card>
              <CardContent className="p-0">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  
                  {/* Canvas para overlay de detecção */}
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />

                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="p-4 flex justify-between items-center">
                  <div className="flex gap-2">
                    {!isRealTimeCorrection ? (
                      <Button onClick={startRealTimeCorrection}>
                        <Play className="w-4 h-4 mr-2" />
                        Iniciar Correção
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={stopRealTimeCorrection}>
                        <Pause className="w-4 h-4 mr-2" />
                        Pausar
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetToStart}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={saveCorrection}
                      disabled={!detectedAnswers.length || isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Salvar Correção
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Respostas detectadas */}
            {detectedAnswers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Respostas Detectadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {detectedAnswers.map((answer, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded-lg border text-center ${
                          answer.isCorrect
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        <div className="font-bold">Q{answer.questionNumber}</div>
                        <div className="text-sm">
                          {answer.selectedOption} 
                          {answer.isCorrect ? (
                            <CheckCircle className="w-3 h-3 inline ml-1" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 inline ml-1" />
                          )}
                        </div>
                        <div className="text-xs opacity-70">
                          {(answer.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step: Correction Complete */}
        {step === 'correction-complete' && correctionResult && (
          <div className="max-w-4xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  Correção Concluída
                </CardTitle>
                <CardDescription>
                  Resultado da correção automática
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary">
                      {correctionResult.score}
                    </div>
                    <div className="text-sm text-muted-foreground">Pontos Obtidos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold">
                      {correctionResult.maxScore}
                    </div>
                    <div className="text-sm text-muted-foreground">Total de Pontos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-600">
                      {correctionResult.percentage.toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Aproveitamento</div>
                  </div>
                </div>

                <Progress value={correctionResult.percentage} className="mt-6" />

                <div className="mt-6 space-y-2">
                  <h4 className="font-semibold">Informações:</h4>
                  <p><strong>Aluno:</strong> {correctionResult.studentName}</p>
                  <p><strong>Data:</strong> {correctionResult.timestamp.toLocaleString()}</p>
                  <p><strong>Respostas Detectadas:</strong> {correctionResult.detectedAnswers.length}</p>
                </div>

                <div className="mt-6 flex justify-center">
                  <Button onClick={resetToStart}>
                    Nova Correção
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}