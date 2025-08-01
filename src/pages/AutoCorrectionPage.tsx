import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, QrCode, Loader2, FileImage, ScanLine, CheckCircle, Save, ArrowLeft, AlertTriangle, PenTool } from 'lucide-react';
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
  const [step, setStep] = useState<'upload' | 'qr-scan' | 'photo-capture' | 'qr-detected' | 'scan-marks' | 'corrected' | 'need-answer-sheet' | 'essay-correction'>('upload');
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
        
        // Se está no modo photo e já tem examInfo, ativar detecção automática do gabarito
        if (scanMode === 'photo') {
          setTimeout(() => {
            startAnswerSheetDetection();
          }, 1000);
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

  // Iniciar câmera para QR ou foto
  const startCamera = async (mode: 'qr' | 'photo') => {
    setScanMode(mode);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log(`📷 Acessando câmera para ${mode === 'qr' ? 'QR Code' : 'captura de foto'}...`);
      
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
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
        title: mode === 'qr' ? "📷 Escaneamento QR ativo!" : "📷 Câmera ativa!",
        description: mode === 'qr' ? "Aproxime o QR code da câmera" : "Posicione a prova para capturar",
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
              title: "Gabarito capturado!",
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

  // Função para detectar automaticamente o gabarito quando a câmera está ativa
  const startAnswerSheetDetection = () => {
    if (scanIntervalRef.current) return;
    
    console.log('🎯 Iniciando detecção automática do gabarito...');
    setAutoDetectGrading(true);
    
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        detectAnswerSheetStructure();
      }
    }, 100); // Detectar a cada 100ms
  };

  // Função para detectar estrutura similar ao gabarito gerado
  const detectAnswerSheetStructure = () => {
    if (!videoRef.current || !canvasRef.current || !cameraStream) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Usar resolução média para detecção
    const scanWidth = 640;
    const scanHeight = 480;
    
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    
    context.drawImage(video, 0, 0, scanWidth, scanHeight);
    const imageData = context.getImageData(0, 0, scanWidth, scanHeight);
    
    // Detectar padrões que indicam um gabarito (linhas, círculos, etc)
    if (detectGradingPattern(imageData)) {
      // Se detectou padrão de gabarito, capturar automaticamente
      console.log('✅ Estrutura de gabarito detectada! Capturando automaticamente...');
      playBeep();
      setDetectedAnswerSheet(true);
      
      // Parar detecção
      setAutoDetectGrading(false);
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      
      // Capturar automaticamente após um delay menor para dar tempo de posicionar
      setTimeout(() => {
        capturePhoto();
      }, 1000); // 1 segundo - delay reduzido
      
      toast({
        title: "🎯 Gabarito detectado!",
        description: "Capturando imagem automaticamente em 1 segundo...",
      });
    }
  };

  // Função simples para detectar padrões que indicam um gabarito
  const detectGradingPattern = (imageData: ImageData): boolean => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let darkPixels = 0;
    let totalPixels = 0;
    let circularPatterns = 0;
    
    // Analisar pixels procurando por padrões de círculos e linhas
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        
        // Calcular luminosidade
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        totalPixels++;
        if (luminance < 128) {
          darkPixels++;
        }
        
        // Detectar possíveis círculos ou padrões circulares
        if (luminance < 100 && x > 10 && x < width - 10 && y > 10 && y < height - 10) {
          // Verificar se há um padrão circular simples
          let surroundingBright = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const surroundIndex = ((y + dy) * width + (x + dx)) * 4;
              const surroundLum = 0.299 * data[surroundIndex] + 0.587 * data[surroundIndex + 1] + 0.114 * data[surroundIndex + 2];
              if (surroundLum > 150) surroundingBright++;
            }
          }
          if (surroundingBright > 12) circularPatterns++;
        }
      }
    }
    
    const darkPixelRatio = darkPixels / totalPixels;
    
    // Heurística: Se há entre 10-40% de pixels escuros e pelo menos 5 padrões circulares
    // provavelmente é um gabarito
    return darkPixelRatio > 0.1 && darkPixelRatio < 0.4 && circularPatterns > 5;
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
        version: qrData.version || 1
      };

      setExamInfo(examInfo);
      setEssayQuestions(essayQuestionsFound);
      setStep('need-answer-sheet'); // Sempre ir para captura do gabarito primeiro
      stopCamera(); // Parar a câmera após detectar
      
      // Automaticamente iniciar captura do gabarito após 1 segundo
      setTimeout(() => {
        startCamera('photo');
      }, 1000);
      
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

  // Etapa 2: Processar marcações e fazer correção (APENAS questões fechadas)
  const processCorrection = async () => {
    if (!selectedFile || !examInfo || !user) {
      toast({
        title: "Erro",
        description: "Informações da prova não encontradas.",
        variant: "destructive",
      });
      return;
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
      
      const openQuestions = examQuestions?.filter(q => q.type === 'essay') || [];
      
      console.log('Questões fechadas:', closedQuestions.length);
      console.log('Questões abertas:', openQuestions.length);

      // Chamar edge function para detectar marcações APENAS das questões fechadas
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-correction', {
        body: {
          fileName: fileName,
          mode: 'detect_marks', // Apenas detectar marcações
          examInfo: {
            ...examInfo,
            // Filtrar answerKey para incluir apenas questões fechadas
            answerKey: Object.fromEntries(
              Object.entries(examInfo.answerKey).filter(([qId]) => 
                closedQuestions.some(q => q.id === qId)
              )
            )
          }
        }
      });

      // Salvar URL da imagem processada
      if (ocrResult && ocrResult.fileName) {
        const { data: imageUrl } = supabase.storage
          .from('correction-scans')
          .getPublicUrl(ocrResult.fileName);
        setProcessedImage(imageUrl.publicUrl);
      }

      if (ocrError) {
        throw new Error(`Erro na detecção de marcações: ${ocrError.message}`);
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
      
      // Se há questões abertas, ir para correção manual após questões fechadas
      if (openQuestions.length > 0) {
        setEssayQuestions(openQuestions);
        setCurrentEssayIndex(0);
        setStep('essay-correction'); // Ir para correção das questões abertas
        
        toast({
          title: "✅ Questões fechadas corrigidas!",
          description: `${score}/${totalPoints} pontos. Agora corrija as ${openQuestions.length} questões abertas.`,
        });
      } else {
        // Se não há questões abertas, finalizar processo
        setStep('corrected');
        
        toast({
          title: "✅ Correção concluída!",
          description: `Nota: ${score}/${totalPoints} (${closedQuestionsResult.percentage}%)`,
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

  const resetProcess = () => {
    setStep('upload');
    setExamInfo(null);
    setCorrectionResult(null);
    setSelectedFile(null);
    setUseCamera(false);
    setScanMode('qr');
    setProcessedImage(null);
    setPreviewImage(null);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Botão para escanear QR code */}
                    <Card className="p-4 border-2 border-dashed border-blue-300 hover:border-blue-500 transition-colors cursor-pointer"
                          onClick={() => startCamera('qr')}>
                      <div className="text-center space-y-3">
                        <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <QrCode className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-blue-900">Escanear QR Code</h3>
                          <p className="text-sm text-blue-600">Detectar QR da prova ao vivo</p>
                        </div>
                      </div>
                    </Card>

                    {/* Botão para capturar gabarito */}
                    <Card className="p-4 border-2 border-dashed border-green-300 hover:border-green-500 transition-colors cursor-pointer"
                          onClick={() => startCamera('photo')}>
                      <div className="text-center space-y-3">
                        <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <Camera className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-green-900">Capturar Gabarito</h3>
                          <p className="text-sm text-green-600">Tirar foto da prova respondida</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative w-full max-w-md mx-auto">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        controls={false}
                        className="w-full rounded-lg border bg-black"
                        style={{ aspectRatio: '16/9' }}
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
                            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-blue-300 font-bold bg-black/50 px-2 py-1 rounded">
                              Posicione o QR aqui
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Guia para Gabarito - retângulo maior
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="relative">
                            <div className="w-64 h-48 border-4 border-green-500 rounded-lg bg-green-500/10 animate-pulse">
                              <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-green-400"></div>
                              <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-green-400"></div>
                              <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-green-400"></div>
                              <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-green-400"></div>
                              
                              {/* Linhas de referência para o gabarito */}
                              <div className="absolute top-4 left-4 right-4 border-t-2 border-green-400/50"></div>
                              <div className="absolute top-8 left-4 right-4 border-t border-green-400/30"></div>
                              <div className="absolute top-12 left-4 right-4 border-t border-green-400/30"></div>
                              
                              {/* Indicador de QR code no canto */}
                              <div className="absolute top-2 right-2 w-8 h-8 border-2 border-green-400/60 rounded text-xs flex items-center justify-center text-green-300">
                                QR
                              </div>
                            </div>
                            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-xs text-green-300 font-bold bg-black/50 px-2 py-1 rounded text-center">
                              Posicione a prova com QR e gabarito aqui
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Canvas invisível para processamento */}
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    
                    <div className="flex gap-2 justify-center">
                      {scanMode === 'qr' && isScanning ? (
                        <div className="text-center space-y-2">
                          <div className="inline-flex items-center gap-2 text-blue-600">
                            <div className="relative">
                              <div className="animate-ping absolute w-4 h-4 bg-blue-400 rounded-full opacity-75"></div>
                              <div className="relative w-4 h-4 bg-blue-600 rounded-full"></div>
                            </div>
                            <ScanLine className="w-5 h-5 animate-pulse" />
                            <span className="text-sm font-bold">ESCANEANDO QR CODE</span>
                          </div>
                          <div className="text-xs text-blue-700 mt-1 font-medium">
                            Aproxime bem o QR code da câmera
                          </div>
                          <Button variant="outline" onClick={stopCamera} size="sm" className="mt-2">
                            ⏹ Parar
                          </Button>
                        </div>
                      ) : isProcessing ? (
                        <div className="text-center">
                          <div className="inline-flex items-center gap-2 text-orange-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Processando...</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {scanMode === 'qr' ? (
                            <Button onClick={() => setIsScanning(true)} size="sm" className="bg-blue-600 hover:bg-blue-700">
                              <ScanLine className="w-4 h-4 mr-2" />
                              Iniciar Scan QR
                            </Button>
                          ) : (
                            <Button onClick={capturePhoto} size="sm" className="bg-green-600 hover:bg-green-700">
                              <Camera className="w-4 h-4 mr-2" />
                              Capturar Foto
                            </Button>
                          )}
                          <Button variant="outline" onClick={stopCamera} size="sm">
                            Cancelar
                          </Button>
                        </div>
                      )}
                      
                      {/* Indicador de detecção automática do gabarito */}
                      {scanMode === 'photo' && autoDetectGrading && (
                        <div className="text-center space-y-2 mt-4">
                          <div className="inline-flex items-center gap-2 text-green-600">
                            <div className="relative">
                              <div className="animate-ping absolute w-4 h-4 bg-green-400 rounded-full opacity-75"></div>
                              <div className="relative w-4 h-4 bg-green-600 rounded-full"></div>
                            </div>
                            <ScanLine className="w-5 h-5 animate-pulse" />
                            <span className="text-sm font-bold">DETECTANDO GABARITO</span>
                          </div>
                          <div className="text-xs text-green-700 mt-1 font-medium">
                            Posicione a prova respondida para detecção automática
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Área de upload de arquivo */}
                <div className="border-t pt-4">
                  <div className="text-center text-muted-foreground mb-3">ou</div>
                  
                  <div>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.heic,.pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedFile(file);
                          
          // Aplicar preprocessamento para preview (COMENTADO TEMPORARIAMENTE)
          try {
            // const processedPreviewUrl = await preprocessImage(file);
            // setPreviewImage(processedPreviewUrl);
            // Usando preview normal por enquanto
            const previewUrl = URL.createObjectURL(file);
            setPreviewImage(previewUrl);
          } catch (error) {
            console.error('Erro no preprocessamento:', error);
            // Fallback para preview normal
            const previewUrl = URL.createObjectURL(file);
            setPreviewImage(previewUrl);
          }
                        }
                      }}
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full"
                    >
                      <FileImage className="w-4 h-4 mr-2" />
                      Enviar Arquivo (JPG, PNG, HEIC, PDF)
                    </Button>
                  </div>
                </div>
              </div>

              {selectedFile && (
                <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Arquivo selecionado:</p>
                    <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-blue-600 mt-1">
                      {selectedFile.type === 'image/heic' || selectedFile.name.toLowerCase().endsWith('.heic') 
                        ? '📱 Arquivo HEIC será convertido automaticamente' 
                        : '✅ Formato suportado'}
                    </p>
                  </div>
                  
                  {/* Preview da imagem */}
                  {previewImage && (
                    <div className="text-center">
                      <p className="text-sm font-medium mb-2">Preview da imagem:</p>
                      <img 
                        src={previewImage} 
                        alt="Preview da prova" 
                        className="max-w-full max-h-48 rounded border mx-auto"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Esta imagem será pré-processada para detecção das marcações
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm text-muted-foreground text-center space-y-1">
                {step === 'upload' && (
                  <>
                    <p>🎯 <strong>Escolha uma opção:</strong> Escanear QR ao vivo ou capturar foto da prova</p>
                    <p>📱 Suporte completo para HEIC, JPG, PNG e PDF</p>
                    <p>⚡ Detecção de QR ultra-robusta com múltiplas configurações</p>
                  </>
                )}
                {step === 'qr-scan' && (
                  <>
                    <p>⚡ <strong>MODO QR:</strong> Aproxime o QR code bem da câmera</p>
                    <p>🚀 Detecção em tempo real com máxima sensibilidade</p>
                    <p>🔊 Som de alerta quando detectado</p>
                  </>
                )}
                {step === 'photo-capture' && (
                  <>
                    <p>📷 <strong>MODO FOTO:</strong> Posicione a prova respondida</p>
                    <p>🎯 Detecção automática quando gabarito for detectado</p>
                    <p>💡 Use boa iluminação para melhor resultado</p>
                  </>
                )}
                {step === 'need-answer-sheet' && examInfo && (
                  <>
                    <p>✅ <strong>QR Code detectado!</strong></p>
                     <p>📋 Prova: {examInfo.examTitle}</p>
                     <p>👤 Aluno: {examInfo.studentName}</p>
                     <p>📷 <strong>Próximo passo:</strong> Capture a prova respondida (QR + gabarito)</p>
                     {essayQuestions.length > 0 && (
                       <p className="text-orange-600 font-medium">⚠️ Esta prova contém {essayQuestions.length} questão(ões) aberta(s) que precisarão de OCR</p>
                     )}
                     <p className="text-xs text-blue-600 mt-1">⏰ A câmera será aberta automaticamente em 3 segundos</p>
                  </>
                )}
                {step === 'qr-detected' && examInfo && (
                  <>
                    <p>✅ <strong>Imagem capturada!</strong></p>
                    <p>📋 Prova: {examInfo.examTitle}</p>
                    <p>👤 Aluno: {examInfo.studentName}</p>
                    <p>🎯 <strong>Pronto para corrigir:</strong> A imagem será pré-processada para detecção</p>
                    {essayQuestions.length > 0 && (
                      <p className="text-orange-600 font-medium">⚠️ Esta prova contém {essayQuestions.length} questão(ões) aberta(s) que precisarão de OCR</p>
                    )}
                  </>
                )}
                {step === 'scan-marks' && (
                  <p>⚡ Processando marcações e comparando com gabarito...</p>
                )}
              </div>

              {/* Botões baseados no estado */}
              {/* Detectar QR Code de arquivo */}
              {selectedFile && step === 'upload' && (
                <Button
                  onClick={async () => {
                    setIsProcessing(true);
                    try {
                      const qrCodeText = await readQRCodeFromFile(selectedFile);
                      if (qrCodeText) {
                        await processQRCodeData(qrCodeText);
                      } else {
                        throw new Error('QR Code não encontrado no arquivo. Verifique se a imagem contém um QR code válido e bem visível.');
                      }
                    } catch (error) {
                      toast({
                        title: "Erro",
                        description: error instanceof Error ? error.message : 'Erro ao processar arquivo',
                        variant: "destructive",
                      });
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando Arquivo...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Processar Correção
                    </>
                  )}
                </Button>
              )}

              {/* Após capturar gabarito ou enviar arquivo - mostrar opções */}
              {selectedFile && (step === 'need-answer-sheet' || step === 'photo-capture') && examInfo && (
                <div className="space-y-3">
                  <Button
                    onClick={() => {
                      setStep('qr-detected'); // Vai para estado pronto para corrigir
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Usar esta imagem como gabarito respondido
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => startCamera('photo')}
                      variant="outline"
                      className="flex-1"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Recapturar
                    </Button>
                    
                    <Button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewImage(null);
                        fileInputRef.current?.click();
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      <FileImage className="w-4 h-4 mr-2" />
                      Novo Arquivo
                    </Button>
                  </div>
                </div>
              )}

              {/* Botão de corrigir prova */}
              {step === 'qr-detected' && examInfo && selectedFile && (
                <Button
                  onClick={processCorrection}
                  disabled={isProcessing}
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Corrigindo prova...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Corrigir Prova Automaticamente
                    </>
                  )}
                </Button>
              )}

              {/* Botões para quando QR detectado mas precisa de gabarito */}
              {step === 'need-answer-sheet' && examInfo && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-semibold">QR Code Detectado!</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><strong>Prova:</strong> {examInfo.examTitle}</p>
                      <p><strong>Aluno:</strong> {examInfo.studentName}</p>
                      <p><strong>Questões:</strong> {Object.keys(examInfo.answerKey).length}</p>
                    </div>
                  </div>

                  <div className="text-center text-muted-foreground">
                    <p className="font-medium">🎯 Agora capture ou envie a prova respondida:</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      onClick={() => startCamera('photo')}
                      variant="outline"
                      className="h-auto p-4"
                    >
                      <div className="text-center">
                        <Camera className="w-6 h-6 mx-auto mb-2 text-green-600" />
                        <div className="text-sm font-medium">Capturar com Câmera</div>
                        <div className="text-xs text-muted-foreground">Tirar foto da prova</div>
                      </div>
                    </Button>

                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="h-auto p-4"
                    >
                      <div className="text-center">
                        <FileImage className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                        <div className="text-sm font-medium">Enviar Arquivo</div>
                        <div className="text-xs text-muted-foreground">JPG, PNG, HEIC</div>
                      </div>
                    </Button>
                  </div>
                  
                  <Button
                    onClick={resetProcess}
                    variant="ghost"
                    className="w-full"
                  >
                    Recomeçar Processo
                  </Button>
                </div>
              )}

              {step === 'corrected' && (
                <Button
                  onClick={resetProcess}
                  variant="outline"
                  className="w-full"
                >
                  Nova Correção
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tela de correção de questões abertas */}
          {step === 'essay-correction' && essayQuestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PenTool className="h-5 w-5 text-orange-600" />
                  Correção Manual - Questões Abertas
                  <Badge variant="outline">
                    {currentEssayIndex + 1} de {essayQuestions.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {essayQuestions.length > 0 && (
                  <>
                    {/* Alerta sobre questões abertas */}
                    <Alert className="mb-6">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Esta prova contém questões abertas que requerem correção manual.
                        Use a ferramenta de OCR para extrair texto manuscrito e compare com o gabarito.
                      </AlertDescription>
                    </Alert>

                    <EssayQuestionCorrection
                      question={essayQuestions[currentEssayIndex]}
                      onScoreSubmit={handleEssayScore}
                      onSkip={skipEssayQuestion}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

                {/* Resultado da correção */}
          {correctionResult && step === 'corrected' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Resultado da Correção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Exibir imagem processada */}
                {processedImage && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-3">Imagem Processada</h4>
                    <div className="max-w-md mx-auto">
                      <img 
                        src={processedImage} 
                        alt="Gabarito processado" 
                        className="w-full rounded-lg border shadow-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Imagem utilizada para detecção das marcações
                      </p>
                    </div>
                  </div>
                )}
                {/* Informações da prova */}
                {(correctionResult as any).examInfo && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg">
                    <h4 className="font-semibold mb-2">Informações da Prova</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <p><strong>Título:</strong> {(correctionResult as any).examInfo.title}</p>
                      <p><strong>Disciplina:</strong> {(correctionResult as any).examInfo.subject}</p>
                      <p><strong>Data:</strong> {(correctionResult as any).examInfo.date}</p>
                      <p><strong>Instituição:</strong> {(correctionResult as any).examInfo.institution}</p>
                      <p><strong>Total de Pontos:</strong> {(correctionResult as any).examInfo.totalPoints}</p>
                    </div>
                  </div>
                )}

                {/* Informações do aluno */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h4 className="font-semibold mb-2">Informações do Aluno</h4>
                  <p><strong>Nome:</strong> {correctionResult.studentName}</p>
                  <p><strong>ID:</strong> {correctionResult.studentId}</p>
                </div>

                {/* Pontuação */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-6 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Pontuação</p>
                    <p className="text-3xl font-bold text-green-600">{correctionResult.score}</p>
                    <p className="text-sm">de {correctionResult.maxScore}</p>
                  </div>
                  <div className="text-center p-6 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Percentual</p>
                    <p className="text-3xl font-bold text-blue-600">{correctionResult.percentage.toFixed(1)}%</p>
                  </div>
                  <div className="text-center p-6 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Acertos</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {correctionResult.feedback.filter(f => f.isCorrect).length}
                    </p>
                    <p className="text-sm">de {correctionResult.feedback.length}</p>
                  </div>
                </div>

                {/* Feedback detalhado */}
                <div>
                  <h4 className="font-semibold mb-3">Respostas Detalhadas</h4>
                  <div className="grid gap-2">
                    {correctionResult.feedback.map((item) => (
                      <div 
                        key={item.questionNumber}
                        className={`p-3 rounded-lg border ${
                          item.isCorrect 
                            ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                            : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Questão {item.questionNumber}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.isCorrect 
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          }`}>
                            {item.isCorrect ? 'Correto' : 'Incorreto'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm">
                          <span>Resposta: <strong>{item.studentAnswer}</strong></span>
                          {!item.isCorrect && (
                            <span className="ml-4">Gabarito: <strong>{item.correctAnswer}</strong></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Questões abertas pendentes */}
                {correctionResult.hasOpenQuestions && correctionResult.openQuestions && correctionResult.openQuestions.length > 0 && (
                  <div className="border-t pt-6">
                    <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="flex items-center gap-2 mb-3">
                        <PenTool className="h-5 w-5 text-orange-600" />
                        <h4 className="font-semibold text-orange-800 dark:text-orange-200">Questões Abertas Pendentes</h4>
                        <Badge variant="outline" className="ml-auto">
                          {correctionResult.openQuestions.length} questões
                        </Badge>
                      </div>
                      <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                        Esta prova contém questões abertas que requerem correção manual. 
                        Capture imagens das respostas manuscritas para análise.
                      </p>
                      
                      <div className="space-y-3">
                        {correctionResult.openQuestions.map((question: any, index: number) => (
                          <Card key={question.id} className="p-4 border-2 border-dashed border-orange-300 hover:border-orange-500 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                    <PenTool className="w-4 h-4 text-orange-600" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-orange-900 dark:text-orange-100">Questão Aberta {index + 1}</p>
                                    <p className="text-xs text-orange-600">{question.points} pontos</p>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">{question.title}</p>
                                <div className="text-xs text-orange-700 dark:text-orange-300">
                                  💡 Pode ser corrigida posteriormente na gestão de correções
                                </div>
                              </div>
                              <Button
                                onClick={() => {
                                  setEssayQuestions(correctionResult.openQuestions);
                                  setCurrentEssayIndex(index);
                                  setStep('essay-correction');
                                }}
                                size="lg"
                                className="ml-4 bg-orange-600 hover:bg-orange-700 h-auto py-3 px-4"
                              >
                                <div className="text-center">
                                  <Camera className="w-5 h-5 mx-auto mb-1" />
                                  <div className="text-sm font-medium">Capturar</div>
                                  <div className="text-xs opacity-90">Resposta Aberta</div>
                                </div>
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Botão para salvar */}
                <Button
                  onClick={() => saveCorrection()}
                  disabled={isSaving}
                  className="w-full"
                  size="lg"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Correção
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}