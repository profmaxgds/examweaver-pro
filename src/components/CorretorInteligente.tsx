import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Play, Square, CheckCircle, XCircle, RotateCcw, ArrowLeft, QrCode, Loader2, Scan } from 'lucide-react';
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
  exam: {
    id: string;
    title: string;
    subject: string;
    total_points: number;
  };
  student: {
    name: string;
    student_id: string;
    student_exam_id: string;
  };
  gabarito: Record<string, { correct_option: string | null; type: string }>;
  coordinates: Record<string, { bubbles: Record<string, { x: number; y: number; w: number; h: number }> }>;
  total_questions: number;
}

interface CorrecaoResult {
  question: string;
  correct: string | null;
  marked: string | null;
  is_correct: boolean;
  type: string;
}

export function CorretorInteligente() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [gabaritoData, setGabaritoData] = useState<GabaritoData | null>(null);
  const [correcaoResults, setCorrecaoResults] = useState<CorrecaoResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number; percentage: number } | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [scanMethod, setScanMethod] = useState<'web' | 'native'>('web');

  // Detectar se é ambiente nativo e auto-iniciar
  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    
    // Em dispositivos móveis nativos, usar método nativo primeiro
    if (native) {
      setScanMethod('native');
      console.log('📱 Dispositivo nativo detectado, usando Capacitor Camera');
    } else {
      setScanMethod('web');
      console.log('🌐 Navegador web detectado, usando WebRTC');
      startCamera();
    }
    
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    console.log('🧹 Limpando recursos...');
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Som de beep melhorado
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

  // Iniciar câmera com fallback robusto (COPIADO DA VERSÃO QUE FUNCIONA)
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      cleanup(); // Limpar recursos anteriores

      console.log('📱 Iniciando câmera...');

      // Configurações otimizadas para QR code scanning com câmera traseira
      const constraints = {
        video: {
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          frameRate: { ideal: 30, min: 15 },
          facingMode: 'environment' // Força câmera traseira
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Aguardar o vídeo carregar completamente
        await new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Elemento de vídeo não encontrado'));
            return;
          }

          const video = videoRef.current;
          
          const handleLoadedData = () => {
            console.log('✅ Vídeo carregado, resolução:', video.videoWidth, 'x', video.videoHeight);
            setCameraStarted(true);
            setIsScanning(true);
            
            // Iniciar escaneamento automático
            setTimeout(() => {
              startAutoScan();
            }, 500);
            
            resolve();
          };

          const handleError = (error: Event) => {
            console.error('❌ Erro ao carregar vídeo:', error);
            reject(new Error('Erro ao carregar stream de vídeo'));
          };

          if (video.readyState >= 2) {
            handleLoadedData();
          } else {
            video.addEventListener('loadeddata', handleLoadedData, { once: true });
            video.addEventListener('error', handleError, { once: true });
          }

          // Timeout de segurança
          setTimeout(() => {
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('error', handleError);
            reject(new Error('Timeout ao inicializar câmera'));
          }, 10000);
        });

        toast({
          title: "📷 Câmera Ativa",
          description: "Posicione o QR code na área de escaneamento",
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

  // Função para escaneamento automático contínuo ultra-rápido (COPIADO DA VERSÃO QUE FUNCIONA)
  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    
    console.log('🚀 Iniciando escaneamento ultra-rápido...');
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        scanVideoForQR();
      }
    }, 50); // 20x por segundo para detecção instantânea
  };

  // Função otimizada para escanear vídeo em busca de QR code (COPIADO DA VERSÃO QUE FUNCIONA)
  const scanVideoForQR = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning || !streamRef.current) return;

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
          handleQRDetected(code.data);
          return; // Sair da função após detecção
        }
      } catch (error) {
        // Continuar para próxima configuração
        continue;
      }
    }
  };

  // Processar QR code detectado
  const handleQRDetected = async (qrData: string) => {
    try {
      console.log('🔍 Processando QR code:', qrData);
      
      // Chamar a edge function para processar o gabarito
      const { data, error } = await supabase.functions.invoke('qr-gabarito-reader', {
        body: { qrData }
      });

      if (error) {
        console.error('❌ Erro ao processar QR:', error);
        toast({
          title: "❌ Erro ao processar QR code",
          description: error.message || 'Erro desconhecido ao processar gabarito',
          variant: "destructive"
        });
        setIsScanning(true);
        startAutoScan();
        return;
      }

      if (data) {
        console.log('✅ Gabarito processado:', data);
        setGabaritoData(data);
        toast({
          title: "✅ QR Code Lido!",
          description: `Prova: ${data.exam.title} | Aluno: ${data.student.name}`,
        });
      }
    } catch (error) {
      console.error('❌ Erro geral ao processar QR:', error);
      toast({
        title: "❌ Erro",
        description: 'Erro inesperado ao processar QR code',
        variant: "destructive"
      });
      setIsScanning(true);
      startAutoScan();
    }
  };

  // Simular correção (placeholder)
  const captureAndProcess = async () => {
    if (!gabaritoData) {
      toast({
        title: "❌ Erro",
        description: "Primeiro escaneie um QR code válido",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      await simulateImageProcessing();
    } catch (error) {
      console.error('❌ Erro na correção:', error);
      toast({
        title: "❌ Erro na correção",
        description: "Erro ao processar a imagem",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Simulação de processamento de imagem
  const simulateImageProcessing = async (): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (!gabaritoData) {
          resolve();
          return;
        }

        const results: CorrecaoResult[] = [];
        let correctCount = 0;
        
        Object.entries(gabaritoData.gabarito).forEach(([questionNum, questionData]) => {
          if (questionData.type === 'essay') {
            results.push({
              question: questionNum,
              correct: null,
              marked: null,
              is_correct: false,
              type: 'essay'
            });
            return;
          }

          // Simular resposta marcada aleatoriamente
          const options = ['A', 'B', 'C', 'D', 'E'];
          const markedOption = options[Math.floor(Math.random() * options.length)];
          const isCorrect = markedOption === questionData.correct_option;
          
          if (isCorrect) correctCount++;

          results.push({
            question: questionNum,
            correct: questionData.correct_option,
            marked: markedOption,
            is_correct: isCorrect,
            type: 'multiple_choice'
          });
        });

        setCorrecaoResults(results);
        setScore({
          correct: correctCount,
          total: results.filter(r => r.type === 'multiple_choice').length,
          percentage: Math.round((correctCount / results.filter(r => r.type === 'multiple_choice').length) * 100)
        });

        toast({
          title: "✅ Correção Concluída",
          description: `${correctCount} acertos de ${results.filter(r => r.type === 'multiple_choice').length} questões`,
        });

        resolve();
      }, 3000);
    });
  };

  // Usar Capacitor Camera para dispositivos nativos
  const scanWithNativeCamera = async () => {
    try {
      setIsScanning(true);
      console.log('📱 Iniciando scanner nativo...');
      
      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        promptLabelHeader: 'Scanner QR Code',
        promptLabelPhoto: 'Tirar Foto',
        promptLabelPicture: 'Escolher da Galeria'
      });

      if (image.dataUrl) {
        await processImageForQR(image.dataUrl);
      }
    } catch (error) {
      console.error('❌ Erro no scanner nativo:', error);
      toast({
        title: "❌ Erro na Câmera",
        description: "Não foi possível acessar a câmera nativa",
        variant: "destructive"
      });
      setIsScanning(false);
    }
  };

  // Processar imagem capturada em busca de QR code
  const processImageForQR = async (dataUrl: string) => {
    try {
      console.log('🔍 Processando imagem para QR code...');
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) return;
        
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Tentar múltiplas configurações
        const configurations = [
          { inversionAttempts: "dontInvert" as const },
          { inversionAttempts: "onlyInvert" as const },
          { inversionAttempts: "attemptBoth" as const }
        ];

        for (const config of configurations) {
          try {
            const code = jsQR(imageData.data, imageData.width, imageData.height, config);
            
            if (code && code.data && code.data.trim()) {
              console.log('✅ QR code encontrado na imagem:', code.data);
              playBeep();
              setIsScanning(false);
              handleQRDetected(code.data);
              return;
            }
          } catch (error) {
            continue;
          }
        }
        
        // Se não encontrou QR code
        console.log('❌ Nenhum QR code encontrado na imagem');
        toast({
          title: "❌ QR Code não encontrado",
          description: "Tente novamente posicionando melhor o QR code",
          variant: "destructive"
        });
        setIsScanning(false);
      };
      
      img.src = dataUrl;
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error);
      setIsScanning(false);
    }
  };

  const reset = () => {
    setGabaritoData(null);
    setCorrecaoResults([]);
    setScore(null);
    setIsProcessing(false);
    if (scanMethod === 'web') {
      setIsScanning(true);
      startAutoScan();
    } else {
      setIsScanning(false);
    }
  };

  const drawGuideMask = () => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Área de escaneamento QR
    const qrSize = Math.min(canvas.width, canvas.height) * 0.6;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = (canvas.height - qrSize) / 2;

    // Máscara escura
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Área clara para QR
    context.globalCompositeOperation = 'destination-out';
    context.fillRect(qrX, qrY, qrSize, qrSize);
    context.globalCompositeOperation = 'source-over';

    // Bordas do QR (animadas)
    const cornerSize = 40;
    const time = Date.now() / 1000;
    const pulseOpacity = 0.5 + 0.3 * Math.sin(time * 3);
    
    context.strokeStyle = `rgba(0, 255, 0, ${pulseOpacity})`;
    context.lineWidth = 4;
    context.lineCap = 'round';

    // Cantos superiores
    context.beginPath();
    context.moveTo(qrX, qrY + cornerSize);
    context.lineTo(qrX, qrY);
    context.lineTo(qrX + cornerSize, qrY);
    context.stroke();

    context.beginPath();
    context.moveTo(qrX + qrSize - cornerSize, qrY);
    context.lineTo(qrX + qrSize, qrY);
    context.lineTo(qrX + qrSize, qrY + cornerSize);
    context.stroke();

    // Cantos inferiores
    context.beginPath();
    context.moveTo(qrX, qrY + qrSize - cornerSize);
    context.lineTo(qrX, qrY + qrSize);
    context.lineTo(qrX + cornerSize, qrY + qrSize);
    context.stroke();

    context.beginPath();
    context.moveTo(qrX + qrSize - cornerSize, qrY + qrSize);
    context.lineTo(qrX + qrSize, qrY + qrSize);
    context.lineTo(qrX + qrSize, qrY + qrSize - cornerSize);
    context.stroke();

    // Texto
    context.fillStyle = 'white';
    context.font = 'bold 18px Arial';
    context.textAlign = 'center';
    context.fillText('Posicione o QR code aqui', canvas.width / 2, qrY - 20);
  };

  // Redesenhar guia quando necessário
  useEffect(() => {
    if (cameraStarted && isScanning) {
      const interval = setInterval(drawGuideMask, 100);
      return () => clearInterval(interval);
    }
  }, [cameraStarted, isScanning]);

  return (
    <div className="space-y-6">
      {/* Header com botão Home */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Corretor Inteligente</h2>
          <p className="text-muted-foreground">Escaneie o QR code da prova para iniciar a correção</p>
        </div>
        <Link to="/">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Button>
        </Link>
      </div>

      {/* Área da câmera */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Scanner QR Code
            {isScanning && (
              <Badge variant="secondary" className="animate-pulse">
                Escaneando...
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scanMethod === 'native' ? (
            // Interface para scanner nativo
            <div className="space-y-4">
              <div className="relative aspect-video bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg overflow-hidden flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                    <Scan className="w-12 h-12 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Scanner Inteligente</h3>
                    <p className="text-muted-foreground text-sm">
                      Toque no botão abaixo para abrir a câmera traseira e escanear o QR code da prova
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center">
                <Button
                  onClick={scanWithNativeCamera}
                  disabled={isScanning}
                  size="lg"
                  className="flex items-center gap-2"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      Escanear QR Code
                    </>
                  )}
                </Button>
              </div>
              
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setScanMethod('web');
                    startCamera();
                  }}
                >
                  Usar câmera web instead
                </Button>
              </div>
            </div>
          ) : (
            // Interface para câmera web
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {!cameraStarted && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center text-white">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                      <p>Iniciando câmera...</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setScanMethod('native');
                  }}
                >
                  Usar scanner nativo instead
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações do gabarito */}
      {gabaritoData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Gabarito Carregado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-semibold">Prova</h4>
                <p className="text-muted-foreground">{gabaritoData.exam.title}</p>
                <p className="text-sm text-muted-foreground">{gabaritoData.exam.subject}</p>
              </div>
              <div>
                <h4 className="font-semibold">Aluno</h4>
                <p className="text-muted-foreground">{gabaritoData.student.name}</p>
                <p className="text-sm text-muted-foreground">ID: {gabaritoData.student.student_id}</p>
              </div>
              <div>
                <h4 className="font-semibold">Questões</h4>
                <p className="text-muted-foreground">{gabaritoData.total_questions} questões</p>
                <p className="text-sm text-muted-foreground">{gabaritoData.exam.total_points} pontos</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={captureAndProcess}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {isProcessing ? 'Processando...' : 'Capturar e Corrigir'}
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reiniciar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultados da correção */}
      {score && correcaoResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Resultado da Correção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{score.correct}</div>
                <div className="text-sm text-muted-foreground">Acertos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{score.total}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{score.percentage}%</div>
                <div className="text-sm text-muted-foreground">Aproveitamento</div>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {correcaoResults.filter(r => r.type === 'multiple_choice').map((result) => (
                <div key={result.question} className="flex items-center justify-between p-2 border rounded">
                  <span className="font-medium">Questão {result.question}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      Gabarito: <span className="font-bold">{result.correct}</span>
                    </span>
                    <span className="text-sm">
                      Marcou: <span className="font-bold">{result.marked}</span>
                    </span>
                    {result.is_correct ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={reset} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />
              Nova Correção
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}