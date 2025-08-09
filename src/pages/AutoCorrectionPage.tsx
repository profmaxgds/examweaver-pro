import React, { useState, useRef, useEffect } from 'react';
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
import { LayoutExtractor } from '@/components/autocorrection/LayoutExtractor';
import { LiveCorrector } from '@/components/autocorrection/LiveCorrector';
import { AnswerEditor } from '@/components/autocorrection/AnswerEditor';

interface QRCodeData {
  examId: string;
  studentId: string;
  studentName?: string;
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
  bubbleCoordinates?: any;
  examHeader?: any;
  examLayout?: string;
  bubbleCoordinatesSearch?: { examId: string; studentId: string };
  htmlContent?: string;
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
  const [step, setStep] = useState<'upload' | 'qr-scan' | 'photo-capture' | 'qr-detected' | 'scan-marks' | 'corrected' | 'need-answer-sheet' | 'essay-correction' | 'capture-answers' | 'layout-extract' | 'live-correction' | 'edit-answers'>('upload');
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [essayQuestions, setEssayQuestions] = useState<any[]>([]);
  const [currentEssayIndex, setCurrentEssayIndex] = useState(0);
  const [essayScores, setEssayScores] = useState<Record<string, { score: number; feedback: string }>>({});
  
  // Estados específicos para visão computacional
  const [layoutData, setLayoutData] = useState<any>(null);
  const [visionResults, setVisionResults] = useState<any>(null);
  const [screenshots, setScreenshots] = useState<{ feedback: string; original: string } | null>(null);
  
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
        
        if (scanMode === 'qr') {
          setTimeout(() => {
            startAutoScan();
          }, 500);
        }
        
        if (scanMode === 'photo' && examInfo?.bubbleCoordinates) {
          setShowAlignmentOverlay(true);
          console.log('🎯 Overlay de alinhamento ativado - coordenadas disponíveis');
          toast({
            title: "🎯 Coordenadas Ativas",
            description: "Posicione a prova usando os pontos de referência verdes para precisão máxima",
            duration: 4000,
          });
        } else if (scanMode === 'photo') {
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
  }, [useCamera, cameraStream, scanMode, examInfo]);

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
      
      const constraints = {
        video: {
          facingMode: mode === 'qr' ? 'environment' : 'environment',
          width: { ideal: 1920, max: 1920 },
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
          
          try {
            const previewUrl = URL.createObjectURL(blob);
            setPreviewImage(previewUrl);
          } catch (error) {
            console.error('Erro no preprocessamento:', error);
            const previewUrl = URL.createObjectURL(blob);
            setPreviewImage(previewUrl);
          }
          
          stopCamera();
          
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
    }, 50);
  };

  // Função otimizada para escanear vídeo em busca de QR code
  const scanVideoForQR = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning || !cameraStream) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

    const scanWidth = 320;
    const scanHeight = 240;
    
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    
    context.imageSmoothingEnabled = false;
    context.drawImage(video, 0, 0, scanWidth, scanHeight);

    const imageData = context.getImageData(0, 0, scanWidth, scanHeight);
    
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
          return;
        }
      } catch (error) {
        continue;
      }
    }
  };

  const processQRCodeData = async (qrCodeText: string) => {
    setIsProcessing(true);
    try {
      console.log('Texto do QR Code:', qrCodeText);
      
      const qrData = extractQRCodeData(qrCodeText);
      if (!qrData) {
        throw new Error('QR Code inválido. Verifique se é um QR code de prova válido.');
      }

      console.log('Dados extraídos do QR:', qrData);

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

      if (qrData.studentExamId) {
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

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .in('id', examData.question_ids);

      if (questionsError) {
        console.error('Erro ao buscar questões:', questionsError);
      }

      const essayQuestionsFound = questionsData?.filter(q => q.type === 'essay') || [];

      const examInfo: ExamInfo = {
        examId: qrData.examId,
        studentId: qrData.studentId,
        examTitle: examData.title,
        studentName: studentData?.name || 'Aluno não identificado',
        answerKey: studentExam.answer_key as Record<string, string>,
        version: qrData.version || 1,
        bubbleCoordinates: studentExam.bubble_coordinates,
        examHeader: null,
        examLayout: examData.layout || 'single_column',
        bubbleCoordinatesSearch: {
          examId: qrData.examId,
          studentId: typeof studentExam.student_id === 'string' ? studentExam.student_id : studentExam.student_id
        },
        htmlContent: studentExam.html_content
      };

      setExamInfo(examInfo);
      setEssayQuestions(essayQuestionsFound);
      
      const hasCoordinates = studentExam.bubble_coordinates && 
                           Object.keys(studentExam.bubble_coordinates).length > 0;
      const hasAnswerKey = examInfo.answerKey && 
                          Object.keys(examInfo.answerKey).length > 0;
      
      console.log('📊 Coordenadas disponíveis:', hasCoordinates);
      console.log('📋 Gabarito disponível:', hasAnswerKey);
      console.log('📄 HTML Content disponível:', !!studentExam.html_content);
      
      if (hasCoordinates && hasAnswerKey) {
        setStep('capture-answers');
        stopCamera();
        
        setTimeout(() => {
          startCamera('photo');
        }, 1000);
        
        toast({
          title: "🎯 Coordenadas Ativas",
          description: "Posicione a folha de respostas alinhada para captura precisa",
        });
      } else if (studentExam.html_content) {
        setStep('layout-extract');
        stopCamera();
        
        toast({
          title: "🔍 Modo Visão Computacional",
          description: "Extraindo layout do HTML para correção automática",
        });
      } else {
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
      setIsScanning(true);
      startAutoScan();
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
      
      const data = JSON.parse(qrCodeText);
      if (data.examId && (data.studentId || data.studentExamId)) {
        return {
          examId: data.examId,
          studentId: data.studentId || data.studentExamId,
          version: data.version || 1,
          studentExamId: data.studentExamId
        };
      }
      
    } catch {
      const patterns = [
        /examId:([^,]+),version:(\d+)/,
        /examId=([^&]+)&studentId=([^&]+)/,
        /studentExamId:(.+)/
      ];
      
      for (const pattern of patterns) {
        const match = qrCodeText.match(pattern);
        if (match) {
          if (pattern === patterns[2]) {
            return {
              examId: 'unknown',
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

  // Handlers para fluxo de visão computacional
  const handleLayoutExtracted = (layout: any) => {
    setLayoutData(layout);
    setStep('live-correction');
    toast({
      title: "Layout extraído!",
      description: "Iniciando correção ao vivo com visão computacional",
    });
  };

  const handleVisionCorrectionComplete = (results: any, screenshots: { feedback: string; original: string }) => {
    setVisionResults(results);
    setScreenshots(screenshots);
    setStep('edit-answers');
    toast({
      title: "Correção completa!",
      description: "Revise os resultados e edite se necessário",
    });
  };

  const handleAnswerEditorSave = (editedResults: any) => {
    const correctionData: CorrectionResult = {
      examId: examInfo!.examId,
      studentId: examInfo!.studentId,
      studentName: examInfo!.studentName,
      answers: Object.fromEntries(
        Object.entries(editedResults).map(([qId, result]: [string, any]) => [qId, result.detectedAnswer])
      ),
      score: Object.values(editedResults).filter((r: any) => r.status === 'CORRETA').length,
      maxScore: Object.keys(editedResults).length,
      percentage: Math.round((Object.values(editedResults).filter((r: any) => r.status === 'CORRETA').length / Object.keys(editedResults).length) * 100),
      correctAnswers: Object.fromEntries(
        Object.entries(editedResults).map(([qId, result]: [string, any]) => [qId, result.correctAnswer])
      ),
      feedback: Object.entries(editedResults).map(([qId, result]: [string, any]) => ({
        questionNumber: qId.replace('Q', ''),
        studentAnswer: result.detectedAnswer,
        correctAnswer: result.correctAnswer,
        isCorrect: result.status === 'CORRETA'
      })),
      hasOpenQuestions: essayQuestions.length > 0,
      openQuestions: essayQuestions
    };

    setCorrectionResult(correctionData);
    setStep('corrected');
  };

  const handleAnswerEditorCancel = () => {
    resetToStart();
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
    setLayoutData(null);
    setVisionResults(null);
    setScreenshots(null);
    
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const convertedFile = await convertHeicToJpeg(file);
      setSelectedFile(convertedFile);
      
      const previewUrl = URL.createObjectURL(convertedFile);
      setPreviewImage(previewUrl);
      
      toast({
        title: "Arquivo carregado!",
        description: "Clique em 'Processar Correção' para começar.",
      });
      
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro ao processar arquivo',
        variant: "destructive",
      });
    }
  };

  const processCorrection = async () => {
    if (!selectedFile || !user) {
      toast({
        title: "Erro",
        description: "Arquivo não encontrado.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setStep('scan-marks');

    try {
      toast({
        title: "🔍 Processando...",
        description: "Detectando QR code e iniciando correção",
      });

      const qrCodeText = await readQRCodeFromFile(selectedFile);
      if (!qrCodeText) {
        throw new Error('QR Code não encontrado na imagem.');
      }

      await processQRCodeData(qrCodeText);
      
    } catch (error) {
      console.error('Erro no processamento:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro no processamento',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
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
                      
                      {scanMode === 'qr' ? (
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
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-green-400"></div>
                          <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-green-400"></div>
                          <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-green-400"></div>
                          <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-green-400"></div>
                          
                          <p className="absolute bottom-12 left-0 right-0 text-xs text-green-600 text-center bg-black/50 text-white py-1">
                            Alinhe a folha de respostas
                          </p>
                        </div>
                      )}
                      
                      <canvas ref={canvasRef} className="hidden" />
                    </div>

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

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {previewImage && !useCamera && (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={previewImage}
                      alt="Preview da imagem"
                      className="w-full max-w-md mx-auto rounded-lg border"
                    />
                  </div>
                  
                  {!isProcessing && !correctionResult && (
                    <div className="flex justify-center">
                      <Button 
                        onClick={processCorrection}
                        className="bg-primary hover:bg-primary/90"
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        Processar Correção
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {isProcessing && (
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {step === 'scan-marks' ? 'Processando marcações...' : 'Processando...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Etapa: Extração de Layout (Visão Computacional) */}
          {step === 'layout-extract' && examInfo?.htmlContent && (
            <LayoutExtractor 
              htmlContent={examInfo.htmlContent} 
              onLayoutExtracted={handleLayoutExtracted}
            />
          )}

          {/* Etapa: Correção ao Vivo (Visão Computacional) */}
          {step === 'live-correction' && layoutData && examInfo && (
            <LiveCorrector
              layoutData={layoutData}
              correctAnswers={examInfo.answerKey}
              onCorrectionComplete={handleVisionCorrectionComplete}
            />
          )}

          {/* Etapa: Editor de Respostas (Visão Computacional) */}
          {step === 'edit-answers' && visionResults && screenshots && (
            <AnswerEditor
              results={visionResults}
              screenshots={screenshots}
              availableOptions={['A', 'B', 'C', 'D', 'E']}
              onSave={handleAnswerEditorSave}
              onCancel={handleAnswerEditorCancel}
            />
          )}

          {/* Resultado da correção */}
          {correctionResult && step === 'corrected' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Resultado da Correção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <h4 className="text-sm font-medium text-muted-foreground">Pontuação</h4>
                    <p className="text-2xl font-bold text-primary">
                      {correctionResult.score}/{correctionResult.maxScore}
                    </p>
                  </div>
                  <div className="text-center">
                    <h4 className="text-sm font-medium text-muted-foreground">Percentual</h4>
                    <p className="text-2xl font-bold text-primary">
                      {correctionResult.percentage.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                    <Badge 
                      variant={correctionResult.percentage >= 60 ? "default" : "destructive"}
                      className="text-sm"
                    >
                      {correctionResult.percentage >= 60 ? "Aprovado" : "Reprovado"}
                    </Badge>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Prova</h4>
                    <p className="font-semibold">{examInfo?.examTitle}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Estudante</h4>
                    <p className="font-semibold">{correctionResult.studentName}</p>
                  </div>
                </div>

                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={resetToStart}>
                    Nova Correção
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}