import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Play, Square, CheckCircle, XCircle, RotateCcw, ArrowLeft, QrCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import { Link } from 'react-router-dom';

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
  const [frameCount, setFrameCount] = useState(0);

  // Auto-iniciar câmera quando componente carregar
  useEffect(() => {
    console.log('🚀 Auto-iniciando câmera...');
    startCamera();
    
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

  // Iniciar câmera com fallback robusto (baseado no código que funciona)
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log('📷 Acessando câmera mobile para QR Code...');
      
      // Configurações otimizadas para dispositivos móveis (igual ao código que funciona)
      const constraints = {
        video: {
          facingMode: 'environment', // Câmera traseira para melhor qualidade
          width: { ideal: 1920, max: 1920 }, // Resolução alta para melhor detecção
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setCameraStarted(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScanning(true);
        
        // Aguardar um pouco antes de iniciar escaneamento
        setTimeout(() => {
          startAutoScan();
        }, 500);
      }
      
      toast.success('📷 Câmera ativa! Posicione o QR code da prova');

    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      
      let errorMessage = "Não foi possível acessar a câmera.";
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = "Permissão negada. Permita o acesso à câmera e recarregue a página.";
        } else if (error.name === 'NotFoundError') {
          errorMessage = "Nenhuma câmera encontrada no dispositivo.";
        } else if (error.name === 'NotSupportedError') {
          errorMessage = "Câmera não suportada neste navegador.";
        } else if (error.name === 'NotReadableError') {
          errorMessage = "Câmera está sendo usada por outro aplicativo.";
        }
      }
      
      toast.error(`Erro de Câmera: ${errorMessage}`);
    }
  };

  // Estratégia 1: Resolução baixa para velocidade máxima
  const scanVideoForQR_Strategy1 = async (): Promise<string | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return null;
    
    // Resolução ultra baixa para velocidade máxima
    canvas.width = 160;
    canvas.height = 120;
    context.imageSmoothingEnabled = false;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      return code?.data || null;
    } catch {
      return null;
    }
  };

  // Estratégia 2: Resolução média
  const scanVideoForQR_Strategy2 = async (): Promise<string | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return null;
    
    // Resolução média
    canvas.width = 640;
    canvas.height = 480;
    context.imageSmoothingEnabled = true;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      return code?.data || null;
    } catch {
      return null;
    }
  };

  // Estratégia 3: Resolução alta com pré-processamento
  const scanVideoForQR_Strategy3 = async (): Promise<string | null> => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context || video.videoWidth === 0 || video.videoHeight === 0) return null;
    
    // Resolução alta
    canvas.width = 1280;
    canvas.height = 720;
    context.imageSmoothingEnabled = true;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    let imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Pré-processamento: aumentar contraste
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      const enhanced = gray > 128 ? 255 : 0;
      data[i] = enhanced;
      data[i + 1] = enhanced;
      data[i + 2] = enhanced;
    }
    
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "onlyInvert" });
      return code?.data || null;
    } catch {
      return null;
    }
  };

  // Função para escaneamento automático ULTRA-rápido com requestAnimationFrame
  const startAutoScan = () => {
    console.log('🚀 Iniciando escaneamento ULTRA-rápido com requestAnimationFrame...');
    
    let frameCount = 0;
    
    const scanLoop = () => {
      if (!isScanning || gabaritoData || !videoRef.current) return;
      
      frameCount++;
      if (frameCount % 10 === 0) {
        console.log(`🔍 Frame ${frameCount} - Escaneando com 3 estratégias...`);
      }
      
      // Executar múltiplas estratégias de detecção simultaneamente
      Promise.all([
        scanVideoForQR_Strategy1(), // Resolução baixa, rápida
        scanVideoForQR_Strategy2(), // Resolução média
        scanVideoForQR_Strategy3(), // Resolução alta
      ]).then(results => {
        const foundQR = results.find(result => result !== null && result.trim().length > 0);
        if (foundQR && !gabaritoData) {
          console.log('✅ QR ENCONTRADO!', foundQR);
          playBeep();
          setIsScanning(false);
          handleQRDetected(foundQR);
          return;
        }
        
        // Continuar escaneamento se ainda estiver ativo
        if (isScanning && !gabaritoData) {
          requestAnimationFrame(scanLoop);
        }
      }).catch(error => {
        console.log('Erro nas estratégias:', error);
        // Continuar mesmo com erro
        if (isScanning && !gabaritoData) {
          requestAnimationFrame(scanLoop);
        }
      });
      
      setFrameCount(frameCount);
    };
    
    // Iniciar o loop
    requestAnimationFrame(scanLoop);
  };


  // Processar QR code detectado
  const handleQRDetected = async (qrData: string) => {
    try {
      setIsProcessing(true);
      
      console.log('🔍 Processando QR Code:', qrData);
      
      const { data, error } = await supabase.functions.invoke('qr-gabarito-reader', {
        body: { qrData }
      });
      
      if (error) {
        console.error('❌ Erro ao processar QR:', error);
        throw error;
      }
      
      if (data.success) {
        setGabaritoData(data);
        toast.success(`✅ Gabarito carregado para ${data.student.name}`);
        
        // Desenhar máscara de guia
        drawGuideMask();
      } else {
        console.error('❌ Dados inválidos:', data);
        throw new Error(data.error || 'Erro ao carregar gabarito');
      }
    } catch (error) {
      console.error('Erro ao processar QR code:', error);
      toast.error('Erro ao processar QR code da prova');
      
      // Reiniciar escaneamento após erro
      setIsScanning(true);
      setTimeout(() => {
        startAutoScan();
      }, 1000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Parar câmera
  const stopCamera = () => {
    setIsScanning(false);
    setCameraStarted(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Desenhar máscara de guia
  const drawGuideMask = useCallback(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Limpar canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenhar área de captura sugerida (retângulo central)
    const rectWidth = canvas.width * 0.8;
    const rectHeight = canvas.height * 0.6;
    const rectX = (canvas.width - rectWidth) / 2;
    const rectY = (canvas.height - rectHeight) / 2;
    
    // Fundo semi-transparente
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Área de captura transparente
    context.globalCompositeOperation = 'destination-out';
    context.fillRect(rectX, rectY, rectWidth, rectHeight);
    
    // Voltar ao modo normal
    context.globalCompositeOperation = 'source-over';
    
    // Desenhar bordas da área de captura
    context.strokeStyle = '#00ff00';
    context.lineWidth = 3;
    context.strokeRect(rectX, rectY, rectWidth, rectHeight);
    
    // Texto de instrução
    context.fillStyle = '#ffffff';
    context.font = '16px Arial';
    context.textAlign = 'center';
    context.fillText(
      'Posicione o gabarito dentro desta área',
      canvas.width / 2,
      rectY - 20
    );
  }, []);

  // Capturar e processar imagem
  const captureAndProcess = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !gabaritoData) return;
    
    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Simular processamento de imagem (aqui você implementaria a lógica de OpenCV)
      const results = await simulateImageProcessing();
      
      setCorrecaoResults(results);
      
      // Calcular score
      const correct = results.filter(r => r.is_correct).length;
      const total = results.length;
      const percentage = Math.round((correct / total) * 100);
      
      setScore({ correct, total, percentage });
      
      toast.success(`Correção concluída: ${correct}/${total} questões corretas`);
      
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      toast.error('Erro ao processar a imagem');
    } finally {
      setIsProcessing(false);
    }
  }, [gabaritoData]);

  // Simular processamento de imagem (substitua pela lógica real)
  const simulateImageProcessing = useCallback(async (): Promise<CorrecaoResult[]> => {
    if (!gabaritoData) return [];
    
    // Simular delay de processamento
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const results: CorrecaoResult[] = [];
    
    Object.entries(gabaritoData.gabarito).forEach(([questionKey, answerData]) => {
      const questionNum = questionKey.replace('q', '');
      
      if (answerData.type === 'essay') {
        results.push({
          question: questionNum,
          correct: null,
          marked: null,
          is_correct: true, // Dissertativas sempre corretas na simulação
          type: 'essay'
        });
      } else {
        // Simular detecção aleatória para múltipla escolha
        const options = ['A', 'B', 'C', 'D', 'E'];
        const markedOption = options[Math.floor(Math.random() * options.length)];
        const isCorrect = markedOption === answerData.correct_option;
        
        results.push({
          question: questionNum,
          correct: answerData.correct_option,
          marked: markedOption,
          is_correct: isCorrect,
          type: 'multiple_choice'
        });
      }
    });
    
    return results.sort((a, b) => parseInt(a.question) - parseInt(b.question));
  }, [gabaritoData]);

  // Reset
  const reset = () => {
    setGabaritoData(null);
    setCorrecaoResults([]);
    setScore(null);
    setFrameCount(0);
    if (overlayCanvasRef.current) {
      const context = overlayCanvasRef.current.getContext('2d');
      if (context) {
        context.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    }
    
    // Reiniciar escaneamento
    if (cameraStarted && !gabaritoData) {
      setIsScanning(true);
      setTimeout(() => {
        startAutoScan();
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header com botão voltar */}
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
              <h1 className="text-2xl font-bold">Corretor Inteligente</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Corretor Inteligente
                {cameraStarted && (
                  <Badge variant="secondary" className="ml-2">
                    Câmera Ativa
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Área de vídeo */}
              <div className="relative">
                <video
                  ref={videoRef}
                  className="w-full max-w-2xl mx-auto rounded-lg bg-black"
                  style={{ aspectRatio: '16/9' }}
                  muted
                  playsInline
                />
                
                {/* Overlay de guia para QR code quando escaneando */}
                {isScanning && !gabaritoData && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative">
                      <div className="w-48 h-48 border-4 border-blue-500 rounded-lg bg-blue-500/10 animate-pulse">
                        <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-blue-400"></div>
                        <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-blue-400"></div>
                        <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-blue-400"></div>
                        <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-blue-400"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <QrCode className="w-16 h-16 text-blue-400 animate-pulse" />
                        </div>
                      </div>
                      <p className="text-sm text-blue-600 mt-2 text-center font-medium">
                        Posicione o QR code da prova aqui
                      </p>
                    </div>
                  </div>
                )}
                
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Controles */}
              <div className="flex justify-center gap-2 flex-wrap">
                {!cameraStarted ? (
                  <Button onClick={startCamera} className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Iniciar Câmera
                  </Button>
                ) : (
                  <Button onClick={stopCamera} variant="outline" className="flex items-center gap-2">
                    <Square className="w-4 h-4" />
                    Parar Câmera
                  </Button>
                )}
                
                {gabaritoData && (
                  <Button 
                    onClick={captureAndProcess} 
                    disabled={isProcessing}
                    className="flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {isProcessing ? 'Processando...' : 'Corrigir Prova'}
                  </Button>
                )}
                
                <Button onClick={reset} variant="outline" className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </Button>
              </div>

              {/* Status */}
              <div className="text-center space-y-2">
                {!gabaritoData && isScanning && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">
                      📱 Aponte a câmera para o QR code da prova
                    </p>
                    {frameCount > 0 && (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>Escaneando (Frame: {frameCount})</span>
                      </div>
                    )}
                  </div>
                )}
                
                {isProcessing && (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <p className="text-blue-600">
                      Processando...
                    </p>
                  </div>
                )}

                {gabaritoData && !isProcessing && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-green-800 text-sm font-medium">
                      ✅ QR Code detectado! Posicione o gabarito na área verde e clique em "Corrigir Prova"
                    </p>
                  </div>
                )}

                {!cameraStarted && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-blue-800 text-sm font-medium">
                      📷 Clique em "Iniciar Câmera" para começar o escaneamento automático
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Informações do gabarito */}
          {gabaritoData && (
            <Card>
              <CardHeader>
                <CardTitle>Gabarito Carregado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold">Prova:</h4>
                    <p>{gabaritoData.exam.title}</p>
                    <p className="text-sm text-muted-foreground">{gabaritoData.exam.subject}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">Aluno:</h4>
                    <p>{gabaritoData.student.name}</p>
                    <p className="text-sm text-muted-foreground">ID: {gabaritoData.student.student_id}</p>
                  </div>
                </div>
                <div>
                  <Badge variant="secondary">
                    {gabaritoData.total_questions} questões
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resultados da correção */}
          {score && (
            <Card>
              <CardHeader>
                <CardTitle>Resultado da Correção</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold">
                    {score.percentage}%
                  </div>
                  <div className="text-muted-foreground">
                    {score.correct} de {score.total} questões corretas
                  </div>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {correcaoResults.map((result) => (
                    <div
                      key={result.question}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <span className="font-medium">Q{result.question}</span>
                      
                      {result.type === 'essay' ? (
                        <Badge variant="secondary">Dissertativa</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            Marcada: {result.marked} | Correta: {result.correct}
                          </span>
                          {result.is_correct ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}