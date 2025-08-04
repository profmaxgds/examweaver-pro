import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, QrCode, Loader2, FileImage, ScanLine, CheckCircle, Save, ArrowLeft, AlertTriangle, PenTool, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import heic2any from 'heic2any';
import { EssayQuestionCorrection } from '@/components/EssayQuestionCorrection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { preprocessImage } from '@/utils/imagePreprocessing';

interface QRCodeData {
  examId: string;
  studentId: string;
  version?: number;
  studentExamId?: string;
}

interface ExamInfo {
  examId: string;
  studentId: string;
  examTitle: string;
  studentName: string;
  answerKey: Record<string, string>;
  version?: number;
  bubbleCoordinates?: any; // Coordenadas das bolhas para overlay visual
  examHeader?: any; // Header/cabeçalho da prova com layout
  examLayout?: string; // Layout da prova (single_column, double_column, etc.)
  bubbleCoordinatesSearch?: { examId: string; studentId: string }; // Para buscar coordenadas no edge function
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

export default function AutoCorrectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Estados principais
  const [step, setStep] = useState<'upload' | 'qr-scan' | 'photo-capture' | 'qr-detected' | 'scan-marks' | 'corrected' | 'need-answer-sheet' | 'essay-correction' | 'capture-answers'>('upload');
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [essayQuestions, setEssayQuestions] = useState<any[]>([]);
  const [currentEssayIndex, setCurrentEssayIndex] = useState(0);
  const [essayScores, setEssayScores] = useState<Record<string, { score: number; feedback: string }>>({});
  
  // Estados da câmera
  const [useCamera, setUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'qr' | 'photo'>('qr');
  const [isSaving, setIsSaving] = useState(false);
  const [autoDetectGrading, setAutoDetectGrading] = useState(false);
  const [detectedAnswerSheet, setDetectedAnswerSheet] = useState(false);
  const [showAlignmentOverlay, setShowAlignmentOverlay] = useState(false);
  
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Limpeza ao desmontar componente
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [cameraStream]);

  // Função para converter arquivos HEIC
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
      try {
        toast({
          title: "Convertendo arquivo HEIC...",
          description: "Processando imagem do iPhone/iPad",
        });

        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8
        }) as Blob;

        return new File([convertedBlob], file.name.replace(/\.heic$/i, '.jpg'), {
          type: 'image/jpeg'
        });
      } catch (error) {
        console.error('Erro ao converter HEIC:', error);
        throw new Error('Erro ao converter arquivo HEIC. Tente um formato diferente.');
      }
    }
    return file;
  };

  // Função para ler QR code de arquivo ultra-robusta
  const readQRCodeFromFile = async (file: File): Promise<string | null> => {
    try {
      // Converter HEIC se necessário
      const processedFile = await convertHeicToJpeg(file);
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) {
              resolve(null);
              return;
            }

            // Usar resolução alta para arquivo
            const maxSize = 1200;
            let { width, height } = img;
            
            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;
            context.drawImage(img, 0, 0, width, height);
            
            const imageData = context.getImageData(0, 0, width, height);
            
            // Tentar múltiplas configurações agressivamente
            const configurations = [
              { inversionAttempts: "dontInvert" as const },
              { inversionAttempts: "onlyInvert" as const },
              { inversionAttempts: "attemptBoth" as const },
              { inversionAttempts: "invertFirst" as const }
            ];

            for (const config of configurations) {
              try {
                const code = jsQR(imageData.data, imageData.width, imageData.height, config);
                if (code && code.data && code.data.trim()) {
                  console.log('✅ QR code encontrado no arquivo:', code.data);
                  resolve(code.data);
                  return;
                }
              } catch (error) {
                continue;
              }
            }

            // Tentar com diferentes escalas se não encontrou
            for (const scale of [0.5, 1.5, 2.0]) {
              const scaledWidth = Math.floor(width * scale);
              const scaledHeight = Math.floor(height * scale);
              
              canvas.width = scaledWidth;
              canvas.height = scaledHeight;
              context.drawImage(img, 0, 0, scaledWidth, scaledHeight);
              
              const scaledImageData = context.getImageData(0, 0, scaledWidth, scaledHeight);
              
              for (const config of configurations) {
                try {
                  const code = jsQR(scaledImageData.data, scaledImageData.width, scaledImageData.height, config);
                  if (code && code.data && code.data.trim()) {
                    console.log('✅ QR code encontrado com escala:', scale, code.data);
                    resolve(code.data);
                    return;
                  }
                } catch (error) {
                  continue;
                }
              }
            }
            
            resolve(null);
          };
          img.onerror = () => reject(new Error('Erro ao carregar imagem'));
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(processedFile);
      });
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      throw error;
    }
  };

  // Configurar o stream no vídeo quando a câmera for ativada
  useEffect(() => {
    if (!useCamera || !cameraStream || !videoRef.current) return;

    const playVideo = async () => {
      if (!videoRef.current) return;
      
      try {
        console.log('Configurando stream no vídeo...');
        videoRef.current.srcObject = cameraStream;
        
        await videoRef.current.play();
        console.log('Vídeo iniciado com sucesso');
        
        // Se está no modo QR, começar escaneamento de QR
        if (scanMode === 'qr') {
          setTimeout(() => {
            startAutoScan();
          }, 500);
        }
        
        // Se está no modo photo e já tem examInfo, ativar overlay de alinhamento
        if (scanMode === 'photo' && examInfo?.bubbleCoordinates) {
          setShowAlignmentOverlay(true);
          console.log('🎯 Overlay de alinhamento ativado - coordenadas disponíveis');
          toast({
            title: "🎯 Coordenadas Ativas",
            description: "Posicione a prova usando os pontos de referência verdes para precisão máxima",
            duration: 4000,
          });
        } else if (scanMode === 'photo') {
          // NÃO fazer detecção automática - apenas mostrar interface para captura manual
          console.log('📷 Modo captura manual ativo');
          toast({
            title: "📷 Modo Manual",
            description: "Posicione a prova e clique em 'Capturar' quando estiver alinhada",
            duration: 4000,
          });
        }
      } catch (error) {
        console.error('Erro ao reproduzir vídeo:', error);
      }
    };

    playVideo();
  }, [useCamera, cameraStream, scanMode]);

  // Som de bip melhorado
  const playBeep = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1200;
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('Erro ao reproduzir som:', error);
    }
  };

  // Iniciar câmera para QR ou foto (otimizado para mobile)
  const startCamera = async (mode: 'qr' | 'photo') => {
    setScanMode(mode);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log(`📷 Acessando câmera mobile para ${mode === 'qr' ? 'QR Code' : 'captura de foto'}...`);
      
      // Configurações otimizadas para dispositivos móveis
      const constraints = {
        video: {
          facingMode: mode === 'qr' ? 'environment' : 'environment', // Câmera traseira para melhor qualidade
          width: { ideal: 1920, max: 1920 }, // Resolução alta para melhor detecção
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setUseCamera(true);
      setStep(mode === 'qr' ? 'qr-scan' : 'photo-capture');
      
      if (mode === 'qr') {
        setIsScanning(true);
      }
      
      toast({
        title: mode === 'qr' ? "📷 Câmera QR ativa!" : "📷 Câmera captura ativa!",
        description: mode === 'qr' ? "Posicione o QR code da prova" : "Posicione a prova respondida",
        duration: 2000,
      });

    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      
      let errorMessage = "Não foi possível acessar a câmera.";
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = "Permissão negada. Permita o acesso à câmera e tente novamente.";
        } else if (error.name === 'NotFoundError') {
          errorMessage = "Nenhuma câmera encontrada no dispositivo.";
        } else if (error.name === 'NotSupportedError') {
          errorMessage = "Câmera não suportada neste navegador.";
        } else if (error.name === 'NotReadableError') {
          errorMessage = "Câmera está sendo usada por outro aplicativo.";
        }
      }
      
      toast({
        title: "Erro de Câmera",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUseCamera(false);
    setStep('upload');
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    if (context) {
      context.drawImage(video, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFile(file);
          
          // Aplicar preprocessamento para preview (COMENTADO TEMPORARIAMENTE)
          try {
            // const processedPreviewUrl = await preprocessImage(file);
            // setPreviewImage(processedPreviewUrl);
            // Usando preview normal por enquanto
            const previewUrl = URL.createObjectURL(blob);
            setPreviewImage(previewUrl);
          } catch (error) {
            console.error('Erro no preprocessamento:', error);
            // Fallback para preview normal
            const previewUrl = URL.createObjectURL(blob);
            setPreviewImage(previewUrl);
          }
          
          stopCamera();
          
          // Se ainda não temos examInfo, tentar detectar QR code na imagem capturada
          if (!examInfo) {
            try {
              console.log('🔍 Tentando detectar QR code na imagem capturada...');
              const qrCodeText = await readQRCodeFromFile(file);
              if (qrCodeText) {
                console.log('✅ QR code encontrado na imagem capturada!');
                await processQRCodeData(qrCodeText);
                return;
              }
            } catch (error) {
              console.log('ℹ️ QR code não encontrado na imagem, mas isso é ok');
            }
          }
          
          // Se já temos examInfo (QR detectado), vamos para estado "pronto para corrigir"
          if (examInfo) {
            setStep('qr-detected');
            toast({
              title: "Folha de respostas capturada!",
              description: "Pronto para correção automática.",
            });
          } else {
            toast({
              title: "Foto capturada!",
              description: "Use 'Processar Correção' para detectar QR code e corrigir.",
            });
          }
        }
      }, 'image/jpeg', 0.8);
    }
  };

  // Função para escaneamento automático contínuo ultra-rápido
  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    
    console.log('🚀 Iniciando escaneamento ultra-rápido...');
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        scanVideoForQR();
      }
    }, 50); // 20x por segundo para detecção instantânea
  };

  // Função otimizada para escanear vídeo em busca de QR code
  const scanVideoForQR = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning || !cameraStream) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Usar resolução muito pequena para máxima velocidade
    const scanWidth = 320;
    const scanHeight = 240;
    
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    
    // Desenhar com suavização desabilitada para velocidade
    context.imageSmoothingEnabled = false;
    context.drawImage(video, 0, 0, scanWidth, scanHeight);

    const imageData = context.getImageData(0, 0, scanWidth, scanHeight);
    
    // Tentar múltiplas configurações para máxima compatibilidade
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
          playBeep();
          setIsScanning(false);
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
          processQRCodeData(code.data);
          return; // Sair da função após detecção
        }
      } catch (error) {
        // Continuar para próxima configuração
        continue;
      }
    }
  };

  const processQRCodeData = async (qrCodeText: string) => {
    setIsProcessing(true);
    try {
      console.log('Texto do QR Code:', qrCodeText);
      
      // Extrair dados do QR code
      const qrData = extractQRCodeData(qrCodeText);
      if (!qrData) {
        throw new Error('QR Code inválido. Verifique se é um QR code de prova válido.');
      }

      console.log('Dados extraídos do QR:', qrData);

      // Buscar dados da prova
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', qrData.examId)
        .eq('author_id', user!.id)
        .single();

      if (examError || !examData) {
        throw new Error('Prova não encontrada no sistema');
      }

      let studentExam;
      let studentData;

      // Verificar se temos studentExamId no QR code (prova individual)
      if (qrData.studentExamId) {
        // Buscar direto pelo student_exam ID
        const { data: examInstance, error: examInstanceError } = await supabase
          .from('student_exams')
          .select(`
            *,
            students!inner(*)
          `)
          .eq('id', qrData.studentExamId)
          .eq('author_id', user!.id)
          .single();

        if (examInstanceError || !examInstance) {
          throw new Error('Gabarito específico do aluno não encontrado');
        }

        studentExam = examInstance;
        studentData = examInstance.students;
      } else {
        // Para provas por versão, buscar gabarito da versão
        const versionStudentId = typeof qrData.studentId === 'string' && qrData.studentId.startsWith('version-') 
          ? qrData.studentId 
          : `version-${qrData.version}`;

        const { data: versionExam, error: versionError } = await supabase
          .from('student_exams')
          .select('*')
          .eq('exam_id', qrData.examId)
          .eq('student_id', versionStudentId)
          .eq('author_id', user!.id)
          .single();

        if (versionError || !versionExam) {
          throw new Error('Gabarito da versão não encontrado');
        }

        studentExam = versionExam;
        studentData = { name: `Versão ${qrData.version}`, student_id: versionStudentId };
      }

      // Buscar questões do exame para verificar se há questões abertas
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .in('id', examData.question_ids);

      if (questionsError) {
        console.error('Erro ao buscar questões:', questionsError);
      }

      console.log('Questões encontradas:', questionsData);
      console.log('Question IDs from exam:', examData.question_ids);

      const essayQuestionsFound = questionsData?.filter(q => q.type === 'essay') || [];
      console.log('Questões abertas encontradas:', essayQuestionsFound);

      const examInfo: ExamInfo = {
        examId: qrData.examId,
        studentId: qrData.studentId,
        examTitle: examData.title,
        studentName: studentData?.name || 'Aluno não identificado',
        answerKey: studentExam.answer_key as Record<string, string>,
        version: qrData.version || 1,
        bubbleCoordinates: studentExam.bubble_coordinates,
        examHeader: null, // Removido já que não temos relação com exam_headers
        examLayout: examData.layout || 'single_column',
        bubbleCoordinatesSearch: {
          examId: qrData.examId,
          studentId: typeof studentExam.student_id === 'string' ? studentExam.student_id : studentExam.student_id
        }
      };

      setExamInfo(examInfo);
      setEssayQuestions(essayQuestionsFound);
      
      // Verificar se temos coordenadas no banco e se o gabarito está completo
      const hasCoordinates = studentExam.bubble_coordinates && 
                           Object.keys(studentExam.bubble_coordinates).length > 0;
      const hasAnswerKey = examInfo.answerKey && 
                          Object.keys(examInfo.answerKey).length > 0;
      
      console.log('📊 Coordenadas disponíveis:', hasCoordinates);
      console.log('📋 Gabarito disponível:', hasAnswerKey);
      console.log('🎯 Bubble coordinates:', studentExam.bubble_coordinates);
      
      if (hasCoordinates && hasAnswerKey) {
        setStep('capture-answers'); // Ir direto para captura de respostas
        stopCamera();
        
        // Automaticamente iniciar captura com coordenadas após 1 segundo
        setTimeout(() => {
          startCamera('photo');
        }, 1000);
        
        toast({
          title: "🎯 Coordenadas Ativas",
          description: "Posicione a folha de respostas alinhada para captura precisa",
        });
      } else {
        // Sem coordenadas ou gabarito, ir para modo de análise básica
        setStep('photo-capture');
        stopCamera();
        
        setTimeout(() => {
          startCamera('photo');
        }, 1000);
        
        toast({
          title: "⚠️ Modo Básico",
          description: "Coordenadas não disponíveis - usando análise básica",
        });
      }
      
      // Alertar sobre questões abertas se houver
      if (essayQuestionsFound.length > 0) {
        toast({
          title: "⚠️ Questões Abertas Detectadas",
          description: `Esta prova contém ${essayQuestionsFound.length} questão(ões) aberta(s) que serão corrigidas após o gabarito.`,
        });
      }
      
      toast({
        title: "✅ QR Code detectado!",
        description: `Prova: ${examInfo.examTitle} | ${examInfo.studentName}`,
      });

    } catch (error) {
      console.error('Erro ao processar QR Code:', error);
      setIsScanning(true); // Continuar escaneando em caso de erro
      startAutoScan(); // Reiniciar escaneamento
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro desconhecido ao processar QR Code',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Função para extrair dados do QR Code
  const extractQRCodeData = (qrCodeText: string): QRCodeData | null => {
    try {
      console.log('Texto do QR Code:', qrCodeText);
      
      // Primeiro, tentar parsear como JSON (novo formato)
      const data = JSON.parse(qrCodeText);
      if (data.examId && (data.studentId || data.studentExamId)) {
        return {
          examId: data.examId,
          studentId: data.studentId || data.studentExamId,
          version: data.version || 1,
          studentExamId: data.studentExamId
        };
      }
      
      // Se não for JSON válido, tentar o formato antigo
    } catch {
      // Formato antigo: examId:valor,version:valor ou examId=valor&studentId=valor
      const patterns = [
        /examId:([^,]+),version:(\d+)/,
        /examId=([^&]+)&studentId=([^&]+)/,
        /studentExamId:(.+)/
      ];
      
      for (const pattern of patterns) {
        const match = qrCodeText.match(pattern);
        if (match) {
          if (pattern === patterns[2]) { // studentExamId format
            return {
              examId: 'unknown', // Will need to fetch from studentExamId
              studentId: match[1],
              version: 1
            };
          } else {
            return {
              examId: match[1],
              studentId: match[2] || `version-${match[2] || 1}`,
              version: parseInt(match[2] || '1')
            };
          }
        }
      }
    }
    
    console.error('Formato de QR Code não reconhecido:', qrCodeText);
    return null;
  };

  // Função para resetar processo
  const resetToStart = () => {
    setStep('upload');
    setExamInfo(null);
    setCorrectionResult(null);
    setSelectedFile(null);
    setProcessedImage(null);
    setPreviewImage(null);
    setEssayQuestions([]);
    setCurrentEssayIndex(0);
    setEssayScores({});
    setDetectedAnswerSheet(false);
    setAutoDetectGrading(false);
    setShowAlignmentOverlay(false);
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    setUseCamera(false);
    setIsScanning(false);
    setScanMode('qr');
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  // Etapa 2: Processar marcações e fazer correção (APENAS questões fechadas)
  const processCorrection = async () => {
    if (!selectedFile || !user) {
      toast({
        title: "Erro",
        description: "Arquivo não encontrado.",
        variant: "destructive",
      });
      return;
    }

    // Se não temos examInfo, tentar detectar QR code primeiro
    if (!examInfo) {
      try {
        toast({
          title: "Detectando QR code...",
          description: "Buscando informações da prova na imagem",
        });

        const qrCodeText = await readQRCodeFromFile(selectedFile);
        if (qrCodeText) {
          console.log('✅ QR code detectado durante processamento!');
          await processQRCodeData(qrCodeText);
          // Depois que o QR foi processado, continuar com a correção
        } else {
          toast({
            title: "QR Code não encontrado",
            description: "Não foi possível detectar o QR code da prova na imagem.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        console.error('Erro ao detectar QR code:', error);
        toast({
          title: "Erro na detecção",
          description: "Não foi possível detectar o QR code da prova.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsProcessing(true);
    setStep('scan-marks');

    try {
      // Upload da imagem com user ID no caminho para seguir políticas RLS
      const fileName = `${user.id}/correction_${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('correction-scans')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Primeiro, buscar informações detalhadas da prova para separar questões
      const { data: examQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .in('id', examInfo.answerKey ? Object.keys(examInfo.answerKey) : []);

      if (questionsError) {
        console.error('Erro ao buscar questões:', questionsError);
      }

      // Separar questões fechadas das abertas
      const closedQuestions = examQuestions?.filter(q => 
        q.type === 'multiple_choice' || q.type === 'true_false'
      ) || [];
      
      const openQuestions = essayQuestions || []; // Usar o state essayQuestions já setado no QR
      
      console.log('Questões fechadas:', closedQuestions.length);
      console.log('Questões abertas:', openQuestions.length);
      console.log('EssayQuestions state:', essayQuestions);

      // Chamar edge function com método baseado em coordenadas (autoGrader integrado)
      console.log('🎯 Iniciando correção automática por coordenadas após QR detection...');
      console.log('📊 Gabarito disponível:', examInfo.answerKey);
      console.log('📊 Questões fechadas detectadas:', closedQuestions.length);
      
      // Verificar se temos coordenadas antes de enviar para edge function
      const hasCoordinates = examInfo.bubbleCoordinates && 
                           Object.keys(examInfo.bubbleCoordinates).length > 0;
      
      if (!hasCoordinates) {
        console.warn('⚠️ Coordenadas não disponíveis - usando análise básica');
      }
      
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-correction', {
        body: {
          fileName: fileName,
          mode: 'coordinate_based', // Modo baseado em coordenadas autoGrader
          examInfo: {
            examId: examInfo.examId,
            studentId: examInfo.studentId,
            examTitle: examInfo.examTitle,
            studentName: examInfo.studentName,
            // Filtrar answerKey para incluir apenas questões fechadas
            answerKey: Object.fromEntries(
              Object.entries(examInfo.answerKey).filter(([qId]) => 
                closedQuestions.some(q => q.id === qId)
              )
            ),
            version: examInfo.version || 1,
            questionCount: closedQuestions.length,
            questionTypes: closedQuestions.map(q => q.type),
            // Coordenadas das bolhas para correção precisa
            bubbleCoordinates: examInfo.bubbleCoordinates,
            // Dados adicionais para busca de coordenadas
            bubbleCoordinatesSearch: {
              examId: examInfo.examId,
              studentId: examInfo.studentId
            }
          }
        }
      });

      // Obter URL da imagem processada
      const { data: imageUrl } = supabase.storage
        .from('correction-scans')
        .getPublicUrl(fileName);
      setProcessedImage(imageUrl.publicUrl);

      if (ocrError) {
        console.error('🚨 Erro detalhado na edge function:', ocrError);
        
        // Tratar diferentes tipos de erro
        if (ocrError.message?.includes('Coordenadas das bolhas não encontradas')) {
          throw new Error('❌ Coordenadas de correção não encontradas. Esta prova precisa ser preparada novamente no sistema.');
        } else if (ocrError.message?.includes('Edge Function returned a non-2xx status code')) {
          throw new Error('❌ Erro no processamento da imagem. Tente novamente ou use uma imagem de melhor qualidade.');
        } else {
          throw new Error(`❌ Erro na detecção de marcações: ${ocrError.message || 'Erro desconhecido'}`);
        }
      }

      // Processar respostas detectadas APENAS para questões fechadas
      const detectedAnswers = ocrResult.detectedAnswers || {};
      
      // Comparar com gabarito apenas das questões fechadas
      const correctAnswers = Object.fromEntries(
        Object.entries(examInfo.answerKey).filter(([qId]) => 
          closedQuestions.some(q => q.id === qId)
        )
      );
      
      console.log('Gabarito questões fechadas:', correctAnswers);
      console.log('Respostas detectadas:', detectedAnswers);
      
      let score = 0;
      const feedback = [];
      let totalPoints = 0;

      // Processar cada questão fechada do gabarito
      for (const [questionId, correctAnswerArray] of Object.entries(correctAnswers)) {
        const question = closedQuestions.find(q => q.id === questionId);
        const questionPoints = question?.points || 1;
        totalPoints += questionPoints;
        
        // O gabarito pode estar como array, pegar o primeiro elemento
        const correctAnswer = Array.isArray(correctAnswerArray) ? correctAnswerArray[0] : correctAnswerArray;
        
        // Encontrar resposta do aluno para esta questão (buscar por índice ou ID)
        let studentAnswer = null;
        const questionIndex = Object.keys(correctAnswers).indexOf(questionId) + 1;
        studentAnswer = detectedAnswers[questionIndex.toString()] || 
                       detectedAnswers[questionId] || 
                       detectedAnswers[`q${questionIndex}`];
        
        console.log(`Questão ${questionIndex} (ID: ${questionId}):`);
        console.log(`  Gabarito: ${correctAnswer}`);
        console.log(`  Detectado: ${studentAnswer || 'Não detectada'}`);
        console.log(`  Correto: ${studentAnswer === correctAnswer}`);
        
        const isCorrect = studentAnswer && studentAnswer === correctAnswer;
        
        if (isCorrect) {
          score += questionPoints;
        }

        feedback.push({
          questionNumber: questionIndex.toString(),
          questionId: questionId,
          studentAnswer: studentAnswer || 'Não detectada',
          correctAnswer: correctAnswer,
          isCorrect: isCorrect,
          points: questionPoints,
          earnedPoints: isCorrect ? questionPoints : 0
        });
      }

      // Buscar dados completos da prova do banco
      const { data: examDetails } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examInfo.examId)
        .single();

      // Criar resultado das questões fechadas com dados completos da prova
      const closedQuestionsResult = {
        examId: examInfo.examId,
        studentId: examInfo.studentId,
        studentName: examInfo.studentName,
        answers: detectedAnswers,
        score: score,
        maxScore: totalPoints,
        percentage: totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0,
        correctAnswers: correctAnswers,
        feedback: feedback,
        hasOpenQuestions: openQuestions.length > 0,
        openQuestions: openQuestions,
        examInfo: {
          title: examDetails?.title || examInfo.examTitle || 'Prova',
          subject: examDetails?.subject || 'Disciplina',
          date: examDetails?.exam_date ? new Date(examDetails.exam_date).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
          institution: examDetails?.institutions || 'Instituição',
          totalPoints: examDetails?.total_points || totalPoints,
          instructions: examDetails?.instructions
        }
      };

      setCorrectionResult(closedQuestionsResult);
      
      // Sempre mostrar resultado das questões fechadas primeiro
      setStep('corrected');
      
      // Se há questões abertas, avisar mas deixar opcional
      if (openQuestions.length > 0) {
        // Toast informativo sobre questões abertas
        toast({
          title: "📝 Questões Abertas Detectadas",
          description: `Correção das múltipla escolha concluída! Há ${openQuestions.length} questão(ões) aberta(s) que podem ser corrigidas manualmente.`,
          duration: 6000,
        });
        
        setEssayQuestions(openQuestions);
        setCurrentEssayIndex(0);
        // NÃO mudar automaticamente para essay-correction, deixar o usuário escolher
      }
      
      const method = ocrResult.method || 'unknown';
      const confidence = ocrResult.confidence || 0;
        
      let methodDescription = '';
      if (method === 'coordinate_based_autoGrader') {
        methodDescription = `✅ Coordenadas precisas (${Math.round(confidence * 100)}%)`;
      } else if (method === 'edge_function_analysis') {
        methodDescription = `🔍 Análise de imagem (${Math.round(confidence * 100)}%)`;
      } else if (method === 'simulation_fallback') {
        methodDescription = `⚠️ Simulação - sem coordenadas (${Math.round(confidence * 100)}%)`;
      } else {
        methodDescription = `🔍 Método: ${method} (${Math.round(confidence * 100)}%)`;
      }
      
      // Toast específico baseado no que foi processado
      if (openQuestions.length > 0) {
        toast({
          title: "✅ Múltipla Escolha Corrigida!",
          description: `Nota parcial: ${score}/${totalPoints} (${closedQuestionsResult.percentage}%) - ${methodDescription}. ${openQuestions.length} questão(ões) aberta(s) podem ser corrigidas.`,
          duration: 8000,
        });
      } else {
        toast({
          title: "✅ Correção Concluída!",
          description: `Nota final: ${score}/${totalPoints} (${closedQuestionsResult.percentage}%) - ${methodDescription}`,
          duration: 6000,
        });
      }

    } catch (error) {
      console.error('Erro no processamento:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro desconhecido no processamento',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Funções para correção de questões abertas
  const handleEssayScore = (questionId: string, score: number, feedback: string, extractedText?: string) => {
    setEssayScores(prev => ({
      ...prev,
      [questionId]: { score, feedback, extractedText }
    }));
    
    // Ir para próxima questão aberta
    if (currentEssayIndex < essayQuestions.length - 1) {
      setCurrentEssayIndex(prev => prev + 1);
    } else {
      // Todas as questões abertas corrigidas, finalizar
      finalizeCorrectionWithEssays();
    }
  };

  const skipEssayQuestion = () => {
    // Ir para próxima questão aberta sem pontuação
    if (currentEssayIndex < essayQuestions.length - 1) {
      setCurrentEssayIndex(prev => prev + 1);
    } else {
      // Finalizar mesmo sem corrigir todas
      finalizeCorrectionWithEssays();
    }
  };

  const finalizeCorrectionWithEssays = () => {
    if (!correctionResult) return;
    
    // Calcular pontuação total incluindo questões abertas
    let totalEssayScore = 0;
    let totalEssayMaxScore = 0;
    
    for (const question of essayQuestions) {
      totalEssayMaxScore += question.points;
      if (essayScores[question.id]) {
        totalEssayScore += essayScores[question.id].score;
      }
    }
    
    const finalScore = correctionResult.score + totalEssayScore;
    const finalMaxScore = correctionResult.maxScore + totalEssayMaxScore;
    const finalPercentage = (finalScore / finalMaxScore) * 100;
    
    // Atualizar resultado final
    setCorrectionResult(prev => prev ? {
      ...prev,
      score: finalScore,
      maxScore: finalMaxScore,
      percentage: finalPercentage,
      // Adicionar scores das questões abertas aos dados
      essayScores
    } as any : null);
    
    setStep('corrected');
    
    toast({
      title: "Correção finalizada!",
      description: `Pontuação final: ${finalScore}/${finalMaxScore} (${finalPercentage.toFixed(1)}%)`,
    });
  };

  const saveCorrection = async (result?: CorrectionResult) => {
    const resultToSave = result || correctionResult;
    if (!resultToSave || !user) return;

    setIsSaving(true);

    try {
      // Preparar dados incluindo questões abertas
      const correctionData = {
        exam_id: resultToSave.examId,
        student_id: null, // Deixar null pois não temos UUID do estudante
        student_identification: resultToSave.studentId, // Usar o ID textual aqui
        student_name: resultToSave.studentName,
        answers: {
          ...resultToSave.answers,
          essay_scores: essayScores // Incluir pontuações das questões abertas
        },
        score: resultToSave.score,
        max_score: resultToSave.maxScore,
        percentage: resultToSave.percentage,
        auto_corrected: !resultToSave.hasOpenQuestions, // Se tem questões abertas, não é totalmente automático
        author_id: user.id,
        image_url: selectedFile ? `correction_${Date.now()}_${selectedFile.name}` : null
      };

      const { error } = await supabase
        .from('exam_corrections')
        .insert(correctionData);

      if (error) {
        throw error;
      }

      toast({
        title: "Sucesso!",
        description: "Correção salva no banco de dados.",
      });

      // Limpar estado
      setCorrectionResult(null);
      setSelectedFile(null);
      setEssayScores({});
      setEssayQuestions([]);
      setCurrentEssayIndex(0);
      
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a correção.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const convertedFile = await convertHeicToJpeg(file);
      setSelectedFile(convertedFile);
      
      // Criar preview da imagem
      const previewUrl = URL.createObjectURL(convertedFile);
      setPreviewImage(previewUrl);
      
      toast({
        title: "Arquivo carregado!",
        description: "Processando automaticamente...",
      });
      
      // Processar correção diretamente
      await processCorrection();
      
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro ao processar arquivo',
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Correção Automática</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Card de captura */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Correção Automática de Provas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center space-y-4">
                {!useCamera ? (
                  <div className="grid grid-cols-1 gap-4">
                    {/* Botão para escanear QR code - otimizado para mobile */}
                    <Card className="p-6 border-2 border-dashed border-blue-300 hover:border-blue-500 transition-colors cursor-pointer touch-manipulation"
                          onClick={() => startCamera('qr')}>
                      <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                          <QrCode className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg text-blue-900">Escanear QR Code</h3>
                          <p className="text-sm text-blue-600">Detectar QR da prova com câmera</p>
                          <p className="text-xs text-gray-500 mt-1">📱 Otimizado para celular</p>
                        </div>
                      </div>
                    </Card>

                    {/* Botão para capturar resposta - otimizado para mobile */}
                    <Card className="p-6 border-2 border-dashed border-green-300 hover:border-green-500 transition-colors cursor-pointer touch-manipulation"
                          onClick={() => startCamera('photo')}>
                      <div className="text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                          <Camera className="w-8 h-8 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg text-green-900">Capturar Resposta</h3>
                          <p className="text-sm text-green-600">Tirar foto da folha de resposta</p>
                          <p className="text-xs text-gray-500 mt-1">🎯 Alinhamento com coordenadas precisas</p>
                        </div>
                      </div>
                    </Card>
                    
                    {/* Botão para upload de arquivo */}
                    <Card className="p-4 border-2 border-dashed border-purple-300 hover:border-purple-500 transition-colors cursor-pointer touch-manipulation"
                          onClick={() => fileInputRef.current?.click()}>
                      <div className="text-center space-y-3">
                        <div className="mx-auto w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                          <Upload className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-purple-900">Enviar Arquivo</h3>
                          <p className="text-sm text-purple-600">JPG, PNG ou HEIC</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Cabeçalho da câmera com informações */}
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {scanMode === 'qr' ? (
                            <QrCode className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Camera className="w-5 h-5 text-green-600" />
                          )}
                          <span className="text-sm font-medium">
                            {scanMode === 'qr' ? 'Modo QR Code' : 'Modo Captura'}
                          </span>
                        </div>
                        <Button
                          onClick={stopCamera}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>

                    {/* Container do vídeo otimizado para mobile */}
                    <div className="relative w-full max-w-sm mx-auto">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        controls={false}
                        className="w-full rounded-lg border bg-black touch-manipulation"
                        style={{ aspectRatio: '4/3' }}
                      />
                      
                      {/* Guias visuais para captura */}
                      {scanMode === 'qr' ? (
                        // Guia para QR Code - quadrado menor no centro
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="relative">
                            <div className="w-32 h-32 border-4 border-blue-500 rounded-lg bg-blue-500/10 animate-pulse">
                              <div className="absolute -top-2 -left-2 w-4 h-4 border-t-4 border-l-4 border-blue-400"></div>
                              <div className="absolute -top-2 -right-2 w-4 h-4 border-t-4 border-r-4 border-blue-400"></div>
                              <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-4 border-l-4 border-blue-400"></div>
                              <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-4 border-r-4 border-blue-400"></div>
                            </div>
                            <p className="text-xs text-blue-600 mt-2 text-center">Posicione o QR code aqui</p>
                          </div>
                        </div>
                      ) : (
                        // Guias para captura de folha de resposta
                        <div className="absolute inset-0 pointer-events-none">
                          {/* Bordas dos cantos para alinhamento */}
                          <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-green-400"></div>
                          <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-green-400"></div>
                          <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-green-400"></div>
                          <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-green-400"></div>
                          
                          {/* Overlay de coordenadas se disponível */}
                          {showAlignmentOverlay && examInfo?.bubbleCoordinates && (
                            <div className="absolute inset-0 bg-green-500/10 border-2 border-green-400 rounded">
                              <p className="absolute bottom-2 left-2 text-xs text-green-600 bg-white/80 px-1 rounded">
                                Coordenadas ativas
                              </p>
                            </div>
                          )}
                          
                          <p className="absolute bottom-12 left-0 right-0 text-xs text-green-600 text-center bg-black/50 text-white py-1">
                            Alinhe a folha de respostas
                          </p>
                        </div>
                      )}
                      
                      {/* Canvas oculto para processamento */}
                      <canvas
                        ref={canvasRef}
                        className="hidden"
                      />
                    </div>

                    {/* Botões de controle da câmera */}
                    <div className="flex justify-center space-x-4">
                      {scanMode === 'photo' && (
                        <Button
                          onClick={capturePhoto}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="lg"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Capturar
                        </Button>
                      )}
                      
                      <Button
                        onClick={resetToStart}
                        variant="outline"
                      >
                        Cancelar
                      </Button>
                    </div>

                    {/* Status do escaneamento */}
                    {isScanning && scanMode === 'qr' && (
                      <div className="text-center">
                        <div className="inline-flex items-center space-x-2 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-lg">
                          <ScanLine className="w-4 h-4 animate-pulse" />
                          <span className="text-sm">Procurando QR code...</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input oculto para upload de arquivo */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Preview da imagem selecionada */}
              {previewImage && !useCamera && (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={previewImage}
                      alt="Preview da imagem"
                      className="w-full max-w-md mx-auto rounded-lg border"
                    />
                  </div>
                  
                  <div className="flex justify-center space-x-4">
                    <Button
                      onClick={processCorrection}
                      disabled={isProcessing}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Processar Correção
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={resetToStart}
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cards de status e resultados */}
          {examInfo && step !== 'upload' && step !== 'qr-scan' && step !== 'photo-capture' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Informações da Prova
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p><strong>Prova:</strong> {examInfo.examTitle}</p>
                    <p><strong>Estudante:</strong> {examInfo.studentName}</p>
                  </div>
                  <div>
                    <p><strong>Versão:</strong> {examInfo.version}</p>
                    <p><strong>Status:</strong> <Badge variant="outline">QR Detectado</Badge></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resultado da correção */}
          {correctionResult && step === 'corrected' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Resultado da Correção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Resumo da pontuação */}
                <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                  <div className="text-center space-y-2">
                    <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                      {correctionResult.score}/{correctionResult.maxScore}
                    </div>
                    <div className="text-xl text-green-600 dark:text-green-400">
                      {correctionResult.percentage}%
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {correctionResult.hasOpenQuestions ? 'Pontuação parcial (questões fechadas)' : 'Pontuação final'}
                    </p>
                  </div>
                </div>

                {/* Detalhes das questões */}
                <div className="space-y-3">
                  <h4 className="font-semibold">Detalhes das Questões:</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {correctionResult.feedback.map((item, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          item.isCorrect
                            ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Questão {item.questionNumber}</span>
                          <Badge variant={item.isCorrect ? 'default' : 'destructive'}>
                            {item.isCorrect ? 'Correta' : 'Incorreta'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <p>Resposta: {item.studentAnswer}</p>
                          <p>Gabarito: {item.correctAnswer}</p>
                          <p>Pontos: {item.earnedPoints}/{item.points}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alertas sobre questões abertas */}
                {correctionResult.hasOpenQuestions && essayQuestions.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Esta prova contém {essayQuestions.length} questão(ões) aberta(s) que precisam ser corrigidas manualmente.
                      A pontuação acima é apenas das questões de múltipla escolha.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Botões de ação */}
                <div className="flex flex-wrap gap-4">
                  {correctionResult.hasOpenQuestions && essayQuestions.length > 0 && (
                    <Button
                      onClick={() => setStep('essay-correction')}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      <PenTool className="w-4 h-4 mr-2" />
                      Corrigir Questões Abertas
                    </Button>
                  )}
                  
                  <Button
                    onClick={() => saveCorrection()}
                    disabled={isSaving}
                    className="bg-green-600 hover:bg-green-700 text-white"
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
                  
                  <Button
                    onClick={resetToStart}
                    variant="outline"
                  >
                    Nova Correção
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Interface de correção de questões abertas */}
          {step === 'essay-correction' && essayQuestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PenTool className="w-5 h-5" />
                  Correção de Questões Abertas
                  <Badge variant="outline">
                    {currentEssayIndex + 1} de {essayQuestions.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EssayQuestionCorrection
                  question={essayQuestions[currentEssayIndex]}
                  onScoreSubmit={handleEssayScore}
                  onSkip={skipEssayQuestion}
                />
              </CardContent>
            </Card>
          )}

          {/* Card de processamento */}
          {step === 'scan-marks' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processando Marcações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Analisando a imagem e detectando marcações...
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}