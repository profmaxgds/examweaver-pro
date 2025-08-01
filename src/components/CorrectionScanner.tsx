import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Eye, AlertCircle, CheckCircle2, X, ScanLine } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

interface CorrectionResult {
  correction: any;
  detailedResults: any[];
  needsReview: boolean;
  confidence: number;
}

interface CorrectionScannerProps {
  examId: string;
  onCorrectionComplete?: (result: CorrectionResult) => void;
}

export function CorrectionScanner({ examId, onCorrectionComplete }: CorrectionScannerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(true);
  const [scanningStatus, setScanningStatus] = useState<string>('Aguardando cabeçalho de respostas...');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionCanvas = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Função para detectar cabeçalho de respostas na imagem
  const detectAnswerSheetHeader = useCallback((canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Detectar regiões com alta densidade de texto/marcações
    let textRegions = 0;
    let circularMarks = 0;
    
    // Análise simplificada: procurar por padrões circulares e linhas horizontais
    const sampleSize = 20; // Analisar a cada 20 pixels para performance
    
    for (let y = 0; y < canvas.height; y += sampleSize) {
      for (let x = 0; x < canvas.width; x += sampleSize) {
        const index = (y * canvas.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        
        // Detectar bordas (diferenças bruscas de cor)
        const brightness = (r + g + b) / 3;
        
        // Contar regiões com contrastes típicos de formulários
        if (brightness < 100 || brightness > 200) {
          textRegions++;
        }
        
        // Detectar possíveis marcações circulares (contraste médio)
        if (brightness >= 100 && brightness <= 180) {
          circularMarks++;
        }
      }
    }
    
    const totalSamples = (canvas.width / sampleSize) * (canvas.height / sampleSize);
    const textDensity = textRegions / totalSamples;
    const markDensity = circularMarks / totalSamples;
    
    // Considerar que há um cabeçalho se há densidade suficiente de texto e marcações
    return textDensity > 0.1 && markDensity > 0.15;
  }, []);

  // Função para verificar automaticamente a presença do cabeçalho
  const checkForAnswerSheet = useCallback(() => {
    if (!videoRef.current || !detectionCanvas.current || !autoDetectionEnabled) return;

    const video = videoRef.current;
    const canvas = detectionCanvas.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState < 2) return;

    // Redimensionar canvas para análise (menor para performance)
    canvas.width = 320;
    canvas.height = 240;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const hasAnswerSheet = detectAnswerSheetHeader(canvas);
    
    if (hasAnswerSheet) {
      setScanningStatus('Cabeçalho detectado! Capturando em 2 segundos...');
      
      // Aguardar 2 segundos antes de capturar automaticamente
      setTimeout(() => {
        if (cameraActive && autoDetectionEnabled) {
          capturePhoto();
          setScanningStatus('Captura automática realizada!');
        }
      }, 2000);
    } else {
      setScanningStatus('Aguardando cabeçalho de respostas...');
    }

    // Continuar verificando se ainda estiver ativo
    if (cameraActive && autoDetectionEnabled) {
      animationRef.current = requestAnimationFrame(checkForAnswerSheet);
    }
  }, [detectAnswerSheetHeader, autoDetectionEnabled, cameraActive]);

  // Iniciar detecção automática quando a câmera estiver ativa
  useEffect(() => {
    if (cameraActive && autoDetectionEnabled && isScanning) {
      checkForAnswerSheet();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraActive, autoDetectionEnabled, isScanning, checkForAnswerSheet]);

  const takePictureWithCamera = async () => {
    try {
      // Verificar se estamos em dispositivo móvel
      if (!Capacitor.isNativePlatform()) {
        // Fallback para web
        await startCamera();
        return;
      }

      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1920,
        height: 1920
      });

      if (image.dataUrl) {
        setCapturedImage(image.dataUrl);
        toast({
          title: "Sucesso",
          description: "Foto capturada com sucesso!",
        });
      }
    } catch (error) {
      console.error('Erro ao capturar foto:', error);
      toast({
        title: "Erro",
        description: "Erro ao acessar a câmera. Verifique as permissões.",
        variant: "destructive",
      });
    }
  };

  const selectFromGallery = async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        toast({
          title: "Aviso",
          description: "Galeria disponível apenas em dispositivos móveis",
        });
        return;
      }

      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      if (image.dataUrl) {
        setCapturedImage(image.dataUrl);
        toast({
          title: "Sucesso",
          description: "Imagem selecionada da galeria!",
        });
      }
    } catch (error) {
      console.error('Erro ao selecionar da galeria:', error);
      toast({
        title: "Erro",
        description: "Erro ao acessar a galeria.",
        variant: "destructive",
      });
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Usar câmera traseira se disponível
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        setIsScanning(true);
      }
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      toast({
        title: "Erro",
        description: "Não foi possível acessar a câmera. Verifique as permissões.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsScanning(false);
    setScanningStatus('Aguardando cabeçalho de respostas...');
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const processCorrection = async (imageData: string) => {
    if (!user) return;

    setProcessing(true);
    setProgress(0);

    try {
      // Simular progresso
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 500);

      const { data, error } = await supabase.functions.invoke('ocr-correction', {
        body: {
          imageData,
          examId
        }
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) throw error;

      setResult(data);
      onCorrectionComplete?.(data);

      toast({
        title: data.needsReview ? "Correção processada (requer revisão)" : "Correção concluída!",
        description: `Confiança: ${(data.confidence * 100).toFixed(1)}% - Pontuação: ${data.correction.score}`,
        variant: data.needsReview ? "default" : "default",
      });

    } catch (error) {
      console.error('Erro na correção:', error);
      toast({
        title: "Erro",
        description: "Não foi possível processar a correção automática.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  const handleFileUpload = (url: string, file: File) => {
    // Converter arquivo para base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setCapturedImage(null);
    setResult(null);
    setProgress(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Camera className="w-5 h-5" />
          <span>Correção Automática</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!capturedImage && !cameraActive && (
          <div className="space-y-4">
            {/* Botões para dispositivos móveis */}
            {Capacitor.isNativePlatform() && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={takePictureWithCamera}
                  className="flex items-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Tirar Foto
                </Button>
                <Button
                  variant="outline"
                  onClick={selectFromGallery}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Galeria
                </Button>
              </div>
            )}
            
            {/* Câmera web para navegador */}
            {!Capacitor.isNativePlatform() && (
              <div className="flex space-x-2">
                <Button onClick={startCamera} className="flex-1">
                  <Camera className="w-4 h-4 mr-2" />
                  Usar Câmera
                </Button>
              </div>
            )}
            
            <div className="text-center">
              <span className="text-sm text-muted-foreground">ou</span>
            </div>

            <div>
              <FileUpload
                bucket="correction-scans"
                allowedTypes={['image/*']}
                maxSize={10}
                onUpload={handleFileUpload}
                entityType="correction"
                entityId={examId}
              />
            </div>
          </div>
        )}

        {cameraActive && (
          <div className="space-y-4">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded-lg"
              />
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={detectionCanvas} className="hidden" />
              
              {/* Overlay de status da detecção automática */}
              {autoDetectionEnabled && (
                <div className="absolute top-2 left-2 right-2 bg-black/70 text-white text-sm p-2 rounded flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ScanLine className="w-4 h-4 animate-pulse" />
                    <span>{scanningStatus}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setAutoDetectionEnabled(false)}
                    className="text-xs h-6 px-2"
                  >
                    Desabilitar Auto-Detecção
                  </Button>
                </div>
              )}
            </div>
            
            <div className="flex space-x-2">
              <Button onClick={capturePhoto} className="flex-1">
                <Camera className="w-4 h-4 mr-2" />
                Capturar Manualmente
              </Button>
              {!autoDetectionEnabled && (
                <Button 
                  variant="outline" 
                  onClick={() => setAutoDetectionEnabled(true)}
                  className="flex-1"
                >
                  <ScanLine className="w-4 h-4 mr-2" />
                  Auto-Detecção
                </Button>
              )}
              <Button variant="outline" onClick={stopCamera}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {capturedImage && !result && (
          <div className="space-y-4">
            <div>
              <img 
                src={capturedImage} 
                alt="Folha de respostas capturada" 
                className="w-full max-h-64 object-contain rounded-lg border"
              />
            </div>
            
            {processing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processando correção...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            <div className="flex space-x-2">
              <Button 
                onClick={() => processCorrection(capturedImage)}
                disabled={processing}
                className="flex-1"
              >
                <Eye className="w-4 h-4 mr-2" />
                {processing ? 'Processando...' : 'Processar Correção'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
                disabled={processing}
                className="flex-1"
              >
                <Camera className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
              <Button variant="outline" onClick={reset} disabled={processing}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${
              result.needsReview 
                ? 'border-yellow-200 bg-yellow-50' 
                : 'border-green-200 bg-green-50'
            }`}>
              <div className="flex items-start space-x-2">
                {result.needsReview ? (
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <h4 className="font-medium">
                    {result.needsReview ? 'Requer Revisão Manual' : 'Correção Automática Concluída'}
                  </h4>
                  <div className="text-sm text-muted-foreground mt-1">
                    <p>Estudante: {result.correction.student_name}</p>
                    <p>Pontuação: {result.correction.score} pontos</p>
                    <p>Confiança: {(result.confidence * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-medium">Detalhes da Correção:</h5>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {result.detailedResults.map((item, index) => (
                  <div 
                    key={index}
                    className={`text-xs p-2 rounded ${
                      item.needsManualReview 
                        ? 'bg-yellow-50 border border-yellow-200' 
                        : item.isCorrect 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">
                        Questão {item.questionNumber} ({item.questionType})
                      </span>
                      <span className="text-xs">
                        {item.points}/{item.maxPoints} pts
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.needsManualReview ? (
                        <span className="text-yellow-600">⚠️ Requer correção manual</span>
                      ) : (
                        <>
                          Resposta: {item.studentAnswer || 'Sem resposta'} 
                          {item.canAutoCorrect && (item.isCorrect ? ' ✓' : ' ✗')}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setCapturedImage(null);
                  setResult(null);
                  startCamera();
                }} 
                className="flex-1"
              >
                <Camera className="w-4 h-4 mr-2" />
                Capturar Novamente
              </Button>
              <Button variant="outline" onClick={reset} className="flex-1">
                Nova Correção
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}