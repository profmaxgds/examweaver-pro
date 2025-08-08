import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LayoutExtractor } from '@/components/autocorrection/LayoutExtractor';
import { LiveCorrector } from '@/components/autocorrection/LiveCorrector';
import { AnswerEditor } from '@/components/autocorrection/AnswerEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Camera, QrCode, Upload, FileImage, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import jsQR from 'jsqr';
import heic2any from 'heic2any';

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
  htmlContent?: string;
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
  
  // Estados principais do fluxo
  const [step, setStep] = useState<'qr-scan' | 'qr-detected' | 'layout-extract' | 'correction' | 'edit'>('qr-scan');
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
  const [correctionResults, setCorrectionResults] = useState<CorrectionResults | null>(null);
  const [screenshots, setScreenshots] = useState<{ feedback: string; original: string } | null>(null);
  
  // Estados da câmera e QR
  const [useCamera, setUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup ao desmontar
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

  // Configurar stream no vídeo
  useEffect(() => {
    if (!useCamera || !cameraStream || !videoRef.current) return;

    const playVideo = async () => {
      if (!videoRef.current) return;
      
      try {
        console.log('🎥 Configurando stream no vídeo...');
        videoRef.current.srcObject = cameraStream;
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play()
              .then(() => {
                console.log('▶️ Vídeo reproduzindo - iniciando scan de QR');
                setTimeout(() => {
                  startAutoScan();
                }, 500);
              })
              .catch(err => {
                console.error('❌ Erro ao reproduzir vídeo:', err);
              });
          }
        };
      } catch (error) {
        console.error('❌ Erro ao configurar vídeo:', error);
      }
    };

    playVideo();
  }, [useCamera, cameraStream]);

  // Converter HEIC para JPEG
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
      try {
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

  // Ler QR code de arquivo
  const readQRCodeFromFile = async (file: File): Promise<string | null> => {
    try {
      const processedFile = await convertHeicToJpeg(file);
      
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
                  console.log('✅ QR code encontrado:', code.data);
                  resolve(code.data);
                  return;
                }
              } catch (error) {
                continue;
              }
            }
            
            resolve(null);
          };
          img.onerror = () => resolve(null);
          img.src = e.target?.result as string;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(processedFile);
      });
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      return null;
    }
  };

  // Iniciar câmera
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log('📷 Acessando câmera para QR scan...');
      
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setUseCamera(true);
      setIsScanning(true);
      
      toast.success('📷 Câmera ativa! Posicione o QR code da prova');

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
      
      toast.error(errorMessage);
    }
  };

  // Parar câmera
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

  // Iniciar scan automático
  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    
    console.log('🚀 Iniciando escaneamento automático...');
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        scanVideoForQR();
      }
    }, 100); // 10x por segundo
  };

  // Escanear vídeo em busca de QR
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
          console.log('✅ QR code detectado!', code.data);
          processQRCodeData(code.data);
          return;
        }
      } catch (error) {
        continue;
      }
    }
  };

  // Processar dados do QR code
  const processQRCodeData = async (qrData: string) => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    try {
      console.log('🔍 Processando dados do QR:', qrData);
      
      const qrInfo: QRCodeData = JSON.parse(qrData);
      
      // Buscar dados do exame
      const { data: exam } = await supabase
        .from('exams')
        .select('*')
        .eq('id', qrInfo.examId)
        .single();

      if (!exam) {
        throw new Error('Exame não encontrado');
      }

      // Buscar HTML do gabarito
      const { data: studentExam } = await supabase
        .from('student_exams')
        .select('*')
        .eq('exam_id', qrInfo.examId)
        .eq('student_id', qrInfo.studentId)
        .single();

      if (!studentExam?.html_content) {
        throw new Error('HTML do gabarito não encontrado');
      }

      // Processar answer_key do Supabase (Json -> Record<string, string>)
      let processedAnswerKey: Record<string, string> = {};
      const answerKey = studentExam.answer_key;
      if (answerKey && typeof answerKey === 'object' && !Array.isArray(answerKey)) {
        Object.entries(answerKey).forEach(([key, value]) => {
          if (typeof value === 'string') {
            processedAnswerKey[key] = value;
          }
        });
      }

      const examInfo: ExamInfo = {
        examId: qrInfo.examId,
        studentId: qrInfo.studentId,
        examTitle: exam.title,
        studentName: qrInfo.studentName || 'Estudante',
        answerKey: processedAnswerKey,
        version: qrInfo.version,
        htmlContent: studentExam.html_content
      };

      setExamInfo(examInfo);
      stopCamera();
      setStep('qr-detected');
      
      toast.success(`✅ QR Code detectado! Exame: ${exam.title}`);

    } catch (error) {
      console.error('Erro ao processar QR:', error);
      toast.error('Erro ao processar QR code. Verifique se é um QR válido.');
      setIsScanning(true);
    }
  };

  // Processar arquivo selecionado
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessing(true);

    try {
      const previewUrl = URL.createObjectURL(file);
      setPreviewImage(previewUrl);

      const qrCodeText = await readQRCodeFromFile(file);
      if (qrCodeText) {
        await processQRCodeData(qrCodeText);
      } else {
        toast.error('QR code não encontrado na imagem');
      }
    } catch (error) {
      toast.error('Erro ao processar arquivo');
    } finally {
      setIsProcessing(false);
    }
  };

  // Iniciar extração de layout
  const startLayoutExtraction = () => {
    if (!examInfo?.htmlContent) return;
    setStep('layout-extract');
  };

  // Callback da extração de layout
  const handleLayoutExtracted = (layout: LayoutData) => {
    setLayoutData(layout);
    setStep('correction');
    toast.success('Layout extraído! Iniciando correção automática...');
  };

  // Callback da correção completa
  const handleCorrectionComplete = (results: CorrectionResults, screenshots: { feedback: string; original: string }) => {
    setCorrectionResults(results);
    setScreenshots(screenshots);
    setStep('edit');
    toast.success('Correção concluída!');
  };

  // Salvar correção final
  const handleSaveCorrection = async (finalResults: CorrectionResults) => {
    if (!examInfo) return;

    try {
      const score = Object.values(finalResults).filter(r => r.status === 'CORRETA').length;
      const maxScore = Object.keys(finalResults).length;
      const percentage = (score / maxScore) * 100;

      const correctionData = {
        exam_id: examInfo.examId,
        student_id: examInfo.studentId,
        student_name: examInfo.studentName,
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
    }
  };

  // Reset do sistema
  const handleReset = () => {
    setStep('qr-scan');
    setExamInfo(null);
    setLayoutData(null);
    setCorrectionResults(null);
    setScreenshots(null);
    setSelectedFile(null);
    setPreviewImage(null);
    stopCamera();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {step !== 'qr-scan' && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-3xl font-bold">Auto Correção Inteligente</h1>
        </div>
        
        {/* Indicador de progresso */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'qr-scan' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <QrCode className="w-4 h-4" />
            QR Code
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'qr-detected' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <CheckCircle className="w-4 h-4" />
            Detectado
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'layout-extract' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <FileImage className="w-4 h-4" />
            Layout
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'correction' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <Camera className="w-4 h-4" />
            Correção
          </div>
        </div>
      </div>

      {/* Etapa 1: Scan de QR Code */}
      {step === 'qr-scan' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Detectar QR Code da Prova
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!useCamera ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">
                    Escaneie o QR code da prova para iniciar a correção automática
                  </p>
                  
                  <div className="flex gap-4 justify-center mb-6">
                    <Button onClick={startCamera} className="flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      Usar Câmera
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Enviar Imagem
                    </Button>
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.heic"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {selectedFile && previewImage && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Imagem selecionada:</h4>
                    <img 
                      src={previewImage} 
                      alt="Preview" 
                      className="max-w-md mx-auto border rounded"
                    />
                    {isProcessing && (
                      <div className="flex items-center justify-center mt-2">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processando QR code...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="w-full max-w-md mx-auto border rounded-lg"
                    autoPlay
                    playsInline
                    muted
                    style={{ objectFit: 'cover' }}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {isScanning && (
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="bg-black/70 text-white p-2 rounded text-sm text-center">
                        📱 Posicione o QR code da prova no centro da tela
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-center">
                  <Button variant="outline" onClick={stopCamera}>
                    Parar Câmera
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Etapa 2: QR Detectado */}
      {step === 'qr-detected' && examInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              QR Code Detectado com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Exame</h4>
                <p className="font-semibold">{examInfo.examTitle}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Estudante</h4>
                <p className="font-semibold">{examInfo.studentName}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">ID do Exame</h4>
                <p className="text-sm font-mono">{examInfo.examId}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Versão</h4>
                <p className="text-sm">{examInfo.version || 1}</p>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <Button onClick={startLayoutExtraction} className="flex items-center gap-2">
                <FileImage className="w-4 h-4" />
                Continuar para Correção
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 3: Extração de Layout */}
      {step === 'layout-extract' && examInfo?.htmlContent && (
        <LayoutExtractor 
          htmlContent={examInfo.htmlContent} 
          onLayoutExtracted={handleLayoutExtracted}
        />
      )}

      {/* Etapa 4: Correção ao Vivo */}
      {step === 'correction' && layoutData && examInfo && (
        <LiveCorrector
          layoutData={layoutData}
          correctAnswers={examInfo.answerKey}
          onCorrectionComplete={handleCorrectionComplete}
        />
      )}

      {/* Etapa 5: Editar Respostas */}
      {step === 'edit' && correctionResults && screenshots && (
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