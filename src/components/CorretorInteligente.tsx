import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle, XCircle, RotateCcw, ArrowLeft, QrCode, Loader2, Scan, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import jsQR from 'jsqr';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';

interface GabaritoData {
  exam: { id: string; title: string; subject: string; total_points: number };
  student: { name: string; student_id: string; student_exam_id: string };
  gabarito: Record<string, { correct_option: string | null; type: string }>;
  coordinates: Record<string, { bubbles: Record<string, { x: number; y: number; w: number; h: number }> }>;
  total_questions: number;
  html_content?: string;
}

interface CorrecaoResult {
  question: string;
  correct: string | null;
  marked: string | null;
  is_correct: boolean;
  type: string;
  confidence?: number;
}

export function CorretorInteligente() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const correctionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [gabaritoData, setGabaritoData] = useState<GabaritoData | null>(null);
  const [correcaoResults, setCorrecaoResults] = useState<CorrecaoResult[]>([]);
  const [score, setScore] = useState<{ correct: number; total: number; percentage: number } | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [scanMethod, setScanMethod] = useState<'web' | 'native'>('web');
  const [correctionMode, setCorrectionMode] = useState<'qr' | 'instant'>('qr');
  const [instantResults, setInstantResults] = useState<Record<string, CorrecaoResult>>({});

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    setScanMethod(native ? 'native' : 'web');
    
    if (!native) {
      startCamera();
    }
    
    return () => cleanup();
  }, []);

  const cleanup = () => {
    [scanIntervalRef, correctionIntervalRef].forEach(ref => {
      if (ref.current) {
        clearInterval(ref.current);
        ref.current = null;
      }
    });
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      cleanup();
      const constraints = {
        video: {
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          frameRate: { ideal: 30, min: 15 },
          facingMode: 'environment'
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          
          const handleLoadedData = () => {
            setCameraStarted(true);
            setIsScanning(true);
            setTimeout(() => {
              correctionMode === 'qr' ? startAutoScan() : startInstantCorrection();
            }, 500);
            resolve();
          };

          if (video.readyState >= 2) {
            handleLoadedData();
          } else {
            video.addEventListener('loadeddata', handleLoadedData, { once: true });
          }
        });

        toast({
          title: "📷 Câmera Ativa",
          description: correctionMode === 'qr' ? "Escaneie o QR code" : "Posicione a folha de resposta",
        });
      }
    } catch (error) {
      console.error('❌ Erro ao iniciar câmera:', error);
      toast({
        title: "❌ Erro na Câmera",
        description: `Não foi possível acessar a câmera: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        variant: "destructive"
      });
    }
  };

  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current?.readyState >= 2) scanVideoForQR();
    }, 50);
  };

  const startInstantCorrection = () => {
    if (correctionIntervalRef.current) return;
    correctionIntervalRef.current = setInterval(() => {
      if (videoRef.current?.readyState >= 2 && gabaritoData) processInstantCorrection();
    }, 200);
  };

  const scanVideoForQR = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context || video.videoWidth === 0) return;

    canvas.width = 320;
    canvas.height = 240;
    context.imageSmoothingEnabled = false;
    context.drawImage(video, 0, 0, 320, 240);

    const imageData = context.getImageData(0, 0, 320, 240);
    
    const configs = [
      { inversionAttempts: "dontInvert" as const },
      { inversionAttempts: "onlyInvert" as const },
      { inversionAttempts: "attemptBoth" as const }
    ];

    for (const config of configs) {
      try {
        const code = jsQR(imageData.data, imageData.width, imageData.height, config);
        if (code?.data?.trim()) {
          setIsScanning(false);
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
          handleQRDetected(code.data);
          return;
        }
      } catch (error) {
        continue;
      }
    }
  };

  const processInstantCorrection = () => {
    if (!videoRef.current || !canvasRef.current || !gabaritoData) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const newResults: Record<string, CorrecaoResult> = {};
    
    Object.entries(gabaritoData.coordinates).forEach(([questionKey, questionData]) => {
      const questionNum = questionKey.replace('q', '');
      const bubbles = questionData.bubbles;
      
      let markedOption = null;
      let maxDarkness = 0;
      
      Object.entries(bubbles).forEach(([option, coords]) => {
        const darkness = analyzeCircleInImageData(imageData, coords.x, coords.y, coords.w / 2);
        if (darkness > maxDarkness && darkness > 0.3) {
          maxDarkness = darkness;
          markedOption = option;
        }
      });
      
      if (markedOption) {
        const correct = gabaritoData.gabarito[questionKey]?.correct_option;
        newResults[questionNum] = {
          question: questionNum,
          correct,
          marked: markedOption,
          is_correct: markedOption === correct,
          type: 'multiple_choice',
          confidence: maxDarkness
        };
      }
    });
    
    setInstantResults(newResults);
  };

  const analyzeCircleInImageData = (imageData: ImageData, x: number, y: number, radius: number): number => {
    const { data, width, height } = imageData;
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    
    let totalPixels = 0;
    let darkPixels = 0;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius) {
          const pixelX = Math.floor(x + dx);
          const pixelY = Math.floor(y + dy);
          
          if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
            const index = (pixelY * width + pixelX) * 4;
            const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
            totalPixels++;
            if (brightness < 128) darkPixels++;
          }
        }
      }
    }
    
    return totalPixels > 0 ? darkPixels / totalPixels : 0;
  };

  const handleQRDetected = async (qrData: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('qr-gabarito-reader', {
        body: { qrData }
      });

      if (error || !data) {
        toast({
          title: "❌ Erro ao processar QR code",
          description: error?.message || 'Erro desconhecido',
          variant: "destructive"
        });
        setIsScanning(true);
        startAutoScan();
        return;
      }

      setGabaritoData(data);
      setCorrectionMode('instant');
      startInstantCorrection();
      
      toast({
        title: "✅ QR Code Lido!",
        description: `${data.exam.title} - ${data.student.name}`,
      });
    } catch (error) {
      console.error('❌ Erro:', error);
      setIsScanning(true);
      startAutoScan();
    }
  };

  const finalizarCorrecao = () => {
    const results = Object.values(instantResults);
    const correctCount = results.filter(r => r.is_correct).length;
    
    setCorrecaoResults(results);
    setScore({
      correct: correctCount,
      total: results.length,
      percentage: results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0
    });

    if (correctionIntervalRef.current) {
      clearInterval(correctionIntervalRef.current);
      correctionIntervalRef.current = null;
    }

    toast({
      title: "✅ Correção Finalizada",
      description: `${correctCount}/${results.length} acertos (${Math.round((correctCount / results.length) * 100)}%)`,
    });
  };

  const reset = () => {
    setGabaritoData(null);
    setCorrecaoResults([]);
    setScore(null);
    setInstantResults({});
    setCorrectionMode('qr');
    cleanup();
    
    if (scanMethod === 'web') {
      setIsScanning(true);
      startAutoScan();
    }
  };

  const drawOverlay = () => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (correctionMode === 'instant' && gabaritoData) {
      // Overlay da folha de resposta
      const scaleX = canvas.width / 800;
      const scaleY = canvas.height / 600;

      Object.entries(gabaritoData.coordinates).forEach(([questionKey, questionData]) => {
        const questionNum = questionKey.replace('q', '');
        const instantResult = instantResults[questionNum];

        Object.entries(questionData.bubbles).forEach(([option, coords]) => {
          const x = coords.x * scaleX;
          const y = coords.y * scaleY;
          const radius = Math.max(coords.w, coords.h) * Math.min(scaleX, scaleY) / 2;

          context.beginPath();
          context.arc(x, y, radius, 0, 2 * Math.PI);
          
          if (instantResult?.marked === option) {
            context.strokeStyle = instantResult.is_correct ? '#22c55e' : '#ef4444';
            context.fillStyle = instantResult.is_correct ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
            context.fill();
          } else {
            context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          }
          
          context.lineWidth = 2;
          context.stroke();
        });
      });

      // Estatísticas em tempo real
      const resultCount = Object.keys(instantResults).length;
      const correctCount = Object.values(instantResults).filter(r => r.is_correct).length;
      
      context.fillStyle = 'rgba(0, 0, 0, 0.8)';
      context.fillRect(10, 10, 300, 80);
      
      context.fillStyle = 'white';
      context.font = 'bold 16px Arial';
      context.textAlign = 'left';
      context.fillText(`Questões: ${resultCount}`, 20, 35);
      context.fillText(`Acertos: ${correctCount}`, 20, 55);
      context.fillText(`Percentual: ${resultCount > 0 ? Math.round((correctCount / resultCount) * 100) : 0}%`, 20, 75);
    }
  };

  useEffect(() => {
    if (cameraStarted) {
      const interval = setInterval(drawOverlay, 100);
      return () => clearInterval(interval);
    }
  }, [cameraStarted, correctionMode, gabaritoData, instantResults]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Corretor Inteligente</h2>
          <p className="text-muted-foreground">
            {correctionMode === 'qr' ? "Escaneie o QR code da prova" : "Posicione a folha para correção instantânea"}
          </p>
        </div>
        <Link to="/">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {correctionMode === 'qr' ? <QrCode className="w-5 h-5" /> : <Target className="w-5 h-5" />}
            {correctionMode === 'qr' ? 'Scanner QR Code' : 'Correção Instantânea'}
            {isScanning && <Badge variant="secondary" className="animate-pulse">Processando...</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            <canvas ref={canvasRef} className="hidden" />
            
            {!cameraStarted && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p>Iniciando câmera...</p>
                </div>
              </div>
            )}
          </div>
          
          {correctionMode === 'instant' && gabaritoData && (
            <div className="flex justify-center space-x-4">
              <Button onClick={finalizarCorrecao} disabled={Object.keys(instantResults).length === 0}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Finalizar Correção
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Novo QR Code
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {gabaritoData && (
        <Card>
          <CardHeader><CardTitle>Informações da Prova</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-muted-foreground">Prova</p><p className="font-medium">{gabaritoData.exam.title}</p></div>
              <div><p className="text-sm text-muted-foreground">Aluno</p><p className="font-medium">{gabaritoData.student.name}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {(correcaoResults.length > 0 || score) && (
        <Card>
          <CardHeader><CardTitle>Resultado da Correção</CardTitle></CardHeader>
          <CardContent>
            {score && (
              <div className="p-4 bg-muted rounded-lg mb-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-2xl font-bold text-green-500">{score.correct}</p><p className="text-sm">Acertos</p></div>
                  <div><p className="text-2xl font-bold text-red-500">{score.total - score.correct}</p><p className="text-sm">Erros</p></div>
                  <div><p className="text-2xl font-bold text-blue-500">{score.percentage}%</p><p className="text-sm">Porcentagem</p></div>
                </div>
              </div>
            )}
            
            <div className="flex justify-center">
              <Button onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Nova Correção
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}