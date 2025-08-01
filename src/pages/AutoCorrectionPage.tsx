import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Camera, Upload, CheckCircle, Loader2, Save, QrCode } from 'lucide-react';
import jsQR from 'jsqr';

interface QRCodeData {
  examId: string;
  studentId: string;
  version?: number;
  studentExamId?: string; // Adicionar campo para compatibilidade
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
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

interface ExamInfo {
  examId: string;
  studentId: string;
  examTitle: string;
  studentName: string;
  answerKey: Record<string, string>;
  version?: number;
}

export default function AutoCorrectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<'capture' | 'qr-detected' | 'correcting' | 'results'>('capture');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Effect para configurar o vídeo quando useCamera ou cameraStream mudar
  useEffect(() => {
    if (useCamera && cameraStream && videoRef.current) {
      console.log('Configurando stream no vídeo via useEffect...');
      videoRef.current.srcObject = cameraStream;
      
      const playVideo = async () => {
        try {
          await videoRef.current?.play();
          console.log('Vídeo iniciado via useEffect');
        } catch (error) {
          console.error('Erro ao reproduzir vídeo via useEffect:', error);
        }
      };

      playVideo();
    }
  }, [useCamera, cameraStream]);

  // Som de bip para quando detectar QR code
  const playBeep = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800; // Frequência agradável
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const startCamera = async () => {
    try {
      // Verificar se getUserMedia está disponível
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log('Tentando acessar a câmera...');
      
      // Configurações para desktop e mobile
      const constraints = {
        video: {
          // Usar câmera traseira no mobile, qualquer câmera no desktop
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Câmera acessada com sucesso');
      
      setCameraStream(stream);
      setUseCamera(true);
      setIsScanning(true); // Iniciar escaneamento automático
      
      // Aguardar um pouco para o vídeo inicializar e então começar o scan
      setTimeout(() => {
        startAutoScan();
      }, 1000);
      setTimeout(() => {
        if (videoRef.current) {
          console.log('Configurando srcObject do vídeo...');
          videoRef.current.srcObject = stream;
          
          // Forçar o play do vídeo
          videoRef.current.play().then(() => {
            console.log('Vídeo iniciado com sucesso');
          }).catch(err => {
            console.error('Erro ao reproduzir vídeo:', err);
            // Tentar novamente em caso de erro
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.play().catch(e => console.error('Erro no segundo tentativa:', e));
              }
            }, 500);
          });
        }
      }, 100);

      toast({
        title: "Sucesso!",
        description: "Câmera ativada com sucesso.",
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
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    if (context) {
      context.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFile(file);
          stopCamera();
          toast({
            title: "Foto capturada!",
            description: "Agora você pode processar a correção.",
          });
        }
      }, 'image/jpeg', 0.8);
    }
  };

  // Função para escaneamento automático contínuo
  const startAutoScan = () => {
    if (scanIntervalRef.current) return; // Já está escaneando
    
    scanIntervalRef.current = setInterval(() => {
      scanVideoForQR();
    }, 500); // Escanear a cada 500ms
  };

  // Função para escanear vídeo em busca de QR code
  const scanVideoForQR = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning || !cameraStream) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      // QR code detectado!
      console.log('QR code detectado automaticamente:', code.data);
      playBeep(); // Fazer o som de bip
      setIsScanning(false);
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      processQRCodeData(code.data);
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

      const examInfo: ExamInfo = {
        examId: qrData.examId,
        studentId: qrData.studentId,
        examTitle: examData.title,
        studentName: studentData?.name || 'Aluno não identificado',
        answerKey: studentExam.answer_key as Record<string, string>,
        version: qrData.version || 1
      };

      setExamInfo(examInfo);
      setStep('qr-detected');
      stopCamera(); // Parar a câmera após detectar
      
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

  // Função para ler QR code localmente da imagem
  const readQRCodeFromImage = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
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

          canvas.width = img.width;
          canvas.height = img.height;
          context.drawImage(img, 0, 0);
          
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          
          resolve(code ? code.data : null);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Etapa 1: Detectar QR Code localmente e carregar informações da prova
  const detectQRCode = async () => {
    if (!selectedFile || !user) {
      toast({
        title: "Erro",
        description: "Selecione uma imagem da prova primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      console.log('Lendo QR Code da imagem...');
      
      // Ler QR code localmente (sem upload)
      const qrCodeText = await readQRCodeFromImage(selectedFile);
      
      if (!qrCodeText) {
        throw new Error('QR Code não encontrado na imagem. Verifique se a imagem contém um QR code válido.');
      }

      console.log('QR Code detectado:', qrCodeText);

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
          .eq('author_id', user.id)
          .single();

        if (examInstanceError || !examInstance) {
          throw new Error('Gabarito específico do aluno não encontrado');
        }

        studentExam = examInstance;
        studentData = examInstance.students;
      } else {
        // Fallback: buscar pelo studentId (para compatibilidade com QR codes antigos)
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('*')
          .eq('student_id', qrData.studentId)
          .eq('author_id', user.id)
          .single();

        if (studentError || !student) {
          throw new Error(`Aluno com ID ${qrData.studentId} não encontrado`);
        }

        const { data: examInstance, error: examInstanceError } = await supabase
          .from('student_exams')
          .select('*')
          .eq('exam_id', qrData.examId)
          .eq('student_id', student.id)
          .single();

        if (examInstanceError || !examInstance) {
          throw new Error('Gabarito do aluno não encontrado');
        }

        studentExam = examInstance;
        studentData = student;
      }

      const examInfo: ExamInfo = {
        examId: qrData.examId,
        studentId: qrData.studentId,
        examTitle: examData.title,
        studentName: studentData?.name || 'Aluno não identificado',
        answerKey: studentExam.answer_key as Record<string, string>,
        version: qrData.version
      };

      setExamInfo(examInfo);
      setStep('qr-detected');
      
      toast({
        title: "QR Code detectado!",
        description: `Prova: ${examInfo.examTitle} | Aluno: ${examInfo.studentName}`,
      });

    } catch (error) {
      console.error('Erro ao detectar QR Code:', error);
      setStep('capture');
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro desconhecido ao detectar QR Code',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Etapa 2: Processar marcações e fazer correção
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
    setStep('correcting');

    try {
      // Upload da imagem com user ID no caminho para seguir políticas RLS
      const fileName = `${user.id}/correction_${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('correction-scans')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Chamar edge function para detectar marcações
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-correction', {
        body: {
          fileName: fileName,
          mode: 'detect_marks', // Apenas detectar marcações
          examInfo: examInfo
        }
      });

      if (ocrError) {
        throw new Error(`Erro na detecção de marcações: ${ocrError.message}`);
      }

      // Processar respostas detectadas
      const detectedAnswers = ocrResult.detectedAnswers || {};
      
      // Comparar com gabarito
      const correctAnswers = examInfo.answerKey;
      let score = 0;
      const feedback = [];

      for (const [questionNum, studentAnswer] of Object.entries(detectedAnswers)) {
        const correctAnswer = correctAnswers[questionNum];
        const isCorrect = studentAnswer === correctAnswer;
        
        if (isCorrect) {
          score += 1; // Assumindo 1 ponto por questão
        }

        feedback.push({
          questionNumber: questionNum,
          studentAnswer: studentAnswer as string,
          correctAnswer: correctAnswer as string,
          isCorrect
        });
      }

      const maxScore = Object.keys(correctAnswers).length;
      const percentage = (score / maxScore) * 100;

      const result: CorrectionResult = {
        examId: examInfo.examId,
        studentId: examInfo.studentId,
        studentName: examInfo.studentName,
        answers: detectedAnswers,
        score,
        maxScore,
        percentage,
        correctAnswers,
        feedback
      };

      setCorrectionResult(result);
      setStep('results');
      
      toast({
        title: "Correção realizada!",
        description: `Prova corrigida: ${score}/${maxScore} (${percentage.toFixed(1)}%)`,
      });

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
    setStep('capture');
    setExamInfo(null);
    setCorrectionResult(null);
    setSelectedFile(null);
    setUseCamera(false);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const saveCorrection = async () => {
    if (!correctionResult || !user) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('exam_corrections')
        .insert({
          exam_id: correctionResult.examId,
          student_id: correctionResult.studentId,
          student_name: correctionResult.studentName,
          answers: correctionResult.answers,
          score: correctionResult.score,
          max_score: correctionResult.maxScore,
          percentage: correctionResult.percentage,
          auto_corrected: true,
          author_id: user.id,
          image_url: selectedFile ? `correction_${Date.now()}_${selectedFile.name}` : null
        });

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
                  <div className="space-y-4">
                    <Button onClick={startCamera} className="w-full">
                      <Camera className="w-4 h-4 mr-2" />
                      Usar Câmera
                    </Button>
                    
                    <div className="text-center text-muted-foreground">ou</div>
                    
                    <div>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setSelectedFile(file);
                        }}
                        className="hidden"
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Enviar Arquivo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      className="w-full max-w-md mx-auto rounded-lg border bg-black"
                      style={{ aspectRatio: '16/9' }}
                    />
                     <div className="flex gap-2 justify-center">
                       {isScanning ? (
                         <div className="text-center space-y-2">
                           <div className="inline-flex items-center gap-2 text-green-600">
                             <div className="animate-pulse w-2 h-2 bg-green-600 rounded-full"></div>
                             Escaneando QR Code automaticamente...
                           </div>
                           <Button variant="outline" onClick={stopCamera}>
                             Cancelar
                           </Button>
                         </div>
                       ) : (
                         <>
                           <Button onClick={capturePhoto}>
                             <Camera className="w-4 h-4 mr-2" />
                             Capturar Foto
                           </Button>
                           <Button variant="outline" onClick={stopCamera}>
                             Cancelar
                           </Button>
                         </>
                       )}
                     </div>
                  </div>
                )}
              </div>

              {selectedFile && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <p className="text-sm font-medium">Arquivo selecionado:</p>
                  <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
                </div>
              )}

              <div className="text-sm text-muted-foreground text-center space-y-1">
                 {step === 'capture' && (
                   <>
                     <p>🎯 <strong>Etapa 1:</strong> Posicione o QR code da prova na câmera</p>
                     <p>📋 O sistema detectará automaticamente e carregará o gabarito</p>
                     <p>🔊 Você ouvirá um "bip" quando o QR code for detectado</p>
                   </>
                 )}
                {step === 'qr-detected' && examInfo && (
                  <>
                    <p>✅ <strong>QR Code detectado!</strong></p>
                    <p>📋 Prova: {examInfo.examTitle}</p>
                    <p>👤 Aluno: {examInfo.studentName}</p>
                    <p>🎯 <strong>Etapa 2:</strong> Agora detecte as marcações</p>
                  </>
                )}
                {step === 'correcting' && (
                  <p>⚡ Processando marcações e comparando com gabarito...</p>
                )}
              </div>

              {/* Botões baseados no estado */}
              {step === 'capture' && (
                <Button
                  onClick={detectQRCode}
                  disabled={!selectedFile || isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Lendo QR Code...
                    </>
                  ) : (
                    <>
                      <QrCode className="mr-2 h-4 w-4" />
                      1. Detectar QR Code
                    </>
                  )}
                </Button>
              )}

              {step === 'qr-detected' && examInfo && (
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
                  
                  <Button
                    onClick={processCorrection}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Detectando marcações...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        2. Processar Marcações
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={resetProcess}
                    variant="outline"
                    className="w-full"
                  >
                    Recomeçar Processo
                  </Button>
                </div>
              )}

              {step === 'results' && (
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

          {/* Resultado da correção */}
          {correctionResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Resultado da Correção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
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

                {/* Botão para salvar */}
                <Button 
                  onClick={saveCorrection}
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

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}