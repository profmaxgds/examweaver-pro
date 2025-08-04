import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Play, Square, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsQR from 'jsqr';

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
  
  const [isScanning, setIsScanning] = useState(false);
  const [gabaritoData, setGabaritoData] = useState<GabaritoData | null>(null);
  const [correcaoResults, setCorrecaoResults] = useState<CorrecaoResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number; percentage: number } | null>(null);
  const [scanningStatus, setScanningStatus] = useState<string>('');
  const [frameCount, setFrameCount] = useState(0);

  // Iniciar câmera com fallback robusto
  const startCamera = useCallback(async () => {
    try {
      console.log('🎥 === INICIANDO CAPTURA DE CÂMERA ===');
      console.log('🌐 User Agent:', navigator.userAgent);
      console.log('🔒 Protocolo:', window.location.protocol);
      
      // Verificar suporte básico
      if (!navigator.mediaDevices) {
        console.error('❌ navigator.mediaDevices não disponível');
        toast.error('Câmera não suportada - tente acessar via HTTPS');
        return;
      }

      if (!navigator.mediaDevices.getUserMedia) {
        console.error('❌ getUserMedia não disponível');
        toast.error('Câmera não suportada neste browser');
        return;
      }

      console.log('✅ APIs de mídia disponíveis');

      // Tentar configurações de câmera com fallback robusto
      let stream: MediaStream | null = null;
      
      try {
        // Tentativa 1: Câmera traseira com alta resolução
        console.log('🔄 Tentativa 1: Câmera traseira com alta resolução');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
        console.log('✅ Stream obtido com câmera traseira!');
      } catch (firstError) {
        console.warn('⚠️ Primeira tentativa falhou:', firstError);
        
        try {
          // Tentativa 2: Câmera traseira com resolução menor
          console.log('🔄 Tentativa 2: Câmera traseira com resolução menor');
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
          console.log('✅ Stream obtido com câmera traseira (resolução menor)!');
        } catch (secondError) {
          console.warn('⚠️ Segunda tentativa falhou:', secondError);
          
          try {
            // Tentativa 3: Câmera frontal
            console.log('🔄 Tentativa 3: Câmera frontal');
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }
            });
            console.log('✅ Stream obtido com câmera frontal!');
          } catch (thirdError) {
            console.warn('⚠️ Terceira tentativa falhou:', thirdError);
            
            try {
              // Tentativa 4: Qualquer câmera disponível
              console.log('🔄 Tentativa 4: Qualquer câmera');
              stream = await navigator.mediaDevices.getUserMedia({
                video: true
              });
              console.log('✅ Stream obtido com qualquer câmera!');
            } catch (fourthError) {
              console.error('❌ Todas as tentativas falharam:', fourthError);
              
              if (fourthError.name === 'NotAllowedError') {
                toast.error('Permissão negada! Permita o acesso à câmera e tente novamente.');
              } else if (fourthError.name === 'NotFoundError') {
                toast.error('Nenhuma câmera encontrada no dispositivo.');
              } else if (fourthError.name === 'NotSupportedError') {
                toast.error('Câmera não suportada. Tente acessar via HTTPS.');
              } else {
                toast.error(`Erro: ${fourthError.message}`);
              }
              return;
            }
          }
        }
      }

      if (stream) {
        console.log('📊 Configurações do stream:', stream.getVideoTracks()[0]?.getSettings());
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        setIsScanning(true);
        
        // Iniciar detecção de QR code
        startQRDetection();
      }
    } catch (error) {
      console.error('💥 Erro geral:', error);
      toast.error('Erro inesperado ao acessar câmera');
    }
  }, []);

  // Parar câmera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Detecção de QR code otimizada
  const startQRDetection = useCallback(() => {
    let frameCount = 0;
    let lastDetectionTime = 0;
    const detectionInterval = 100; // Detectar a cada 100ms para melhor performance
    
    const detectQR = (timestamp: number) => {
      if (!videoRef.current || !canvasRef.current || !isScanning || gabaritoData) return;
      
      // Throttle da detecção para evitar sobrecarga
      if (timestamp - lastDetectionTime < detectionInterval) {
        if (isScanning) {
          requestAnimationFrame(detectQR);
        }
        return;
      }
      
      lastDetectionTime = timestamp;
      frameCount++;
      setFrameCount(frameCount);
      
      // Atualizar status de scanning
      if (frameCount % 30 === 0) { // A cada 30 frames (aprox. 3 segundos)
        setScanningStatus(`Procurando QR code... (Frame ${frameCount})`);
      }
      
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      if (!context || video.readyState < 2) {
        if (isScanning) {
          requestAnimationFrame(detectQR);
        }
        return;
      }
      
      // Usar resolução otimizada para detecção (menor para performance)
      const detectionWidth = Math.min(video.videoWidth, 800);
      const detectionHeight = Math.min(video.videoHeight, 600);
      
      canvas.width = detectionWidth;
      canvas.height = detectionHeight;
      context.drawImage(video, 0, 0, detectionWidth, detectionHeight);
      
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Configurações otimizadas do jsQR para melhor detecção
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert', // Não tentar inversão para performance
        });
        
        if (qrCode && qrCode.data && qrCode.data.trim().length > 0) {
          console.log('🎯 QR Code detectado:', qrCode.data);
          console.log('📍 Posição:', qrCode.location);
          console.log('📊 Frame #:', frameCount);
          
          // Validar se o QR code parece válido (contém informações estruturadas)
          try {
            // Tentar detectar se é um QR code de prova válido
            if (qrCode.data.includes('exam') || qrCode.data.includes('student') || qrCode.data.length > 10) {
              handleQRDetected(qrCode.data);
              return; // Parar detecção após encontrar QR válido
            }
          } catch (validationError) {
            console.log('⚠️ QR Code inválido ignorado:', qrCode.data);
          }
        }
        
        // Aplicar filtros de melhoria de imagem a cada 10 frames para tentar melhorar detecção
        if (frameCount % 10 === 0) {
          try {
            // Aumentar contraste para melhorar detecção
            const enhancedImageData = enhanceImageForQR(imageData);
            const enhancedQrCode = jsQR(enhancedImageData.data, enhancedImageData.width, enhancedImageData.height);
            
            if (enhancedQrCode && enhancedQrCode.data && enhancedQrCode.data.trim().length > 0) {
              console.log('🎯 QR Code detectado (melhorado):', enhancedQrCode.data);
              if (enhancedQrCode.data.includes('exam') || enhancedQrCode.data.includes('student') || enhancedQrCode.data.length > 10) {
                handleQRDetected(enhancedQrCode.data);
                return;
              }
            }
          } catch (enhanceError) {
            console.log('⚠️ Erro no melhoramento de imagem:', enhanceError);
          }
        }
        
      } catch (detectionError) {
        console.log('⚠️ Erro na detecção QR:', detectionError);
      }
      
      if (isScanning && !gabaritoData) {
        requestAnimationFrame(detectQR);
      }
    };
    
    // Iniciar detecção
    requestAnimationFrame(detectQR);
  }, [isScanning, gabaritoData]);

  // Função para melhorar qualidade da imagem para detecção de QR
  const enhanceImageForQR = useCallback((imageData: ImageData): ImageData => {
    const data = new Uint8ClampedArray(imageData.data);
    
    for (let i = 0; i < data.length; i += 4) {
      // Converter para escala de cinza e aumentar contraste
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      
      // Aplicar threshold para binarizar a imagem
      const enhanced = gray > 128 ? 255 : 0;
      
      data[i] = enhanced;     // R
      data[i + 1] = enhanced; // G
      data[i + 2] = enhanced; // B
      // data[i + 3] mantém o alpha
    }
    
    return new ImageData(data, imageData.width, imageData.height);
  }, []);

  // Processar QR code detectado
  const handleQRDetected = async (qrData: string) => {
    try {
      setIsProcessing(true);
      
      const { data, error } = await supabase.functions.invoke('qr-gabarito-reader', {
        body: { qrData }
      });
      
      if (error) throw error;
      
      if (data.success) {
        setGabaritoData(data);
        toast.success(`Gabarito carregado para ${data.student.name}`);
        
        // Desenhar máscara de guia
        drawGuideMask();
      } else {
        toast.error(data.error || 'Erro ao carregar gabarito');
      }
    } catch (error) {
      console.error('Erro ao processar QR code:', error);
      toast.error('Erro ao processar QR code da prova');
    } finally {
      setIsProcessing(false);
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
    
    // Cantos de referência
    const cornerSize = 20;
    context.strokeStyle = '#00ff00';
    context.lineWidth = 4;
    
    // Canto superior esquerdo
    context.beginPath();
    context.moveTo(rectX, rectY + cornerSize);
    context.lineTo(rectX, rectY);
    context.lineTo(rectX + cornerSize, rectY);
    context.stroke();
    
    // Canto superior direito
    context.beginPath();
    context.moveTo(rectX + rectWidth - cornerSize, rectY);
    context.lineTo(rectX + rectWidth, rectY);
    context.lineTo(rectX + rectWidth, rectY + cornerSize);
    context.stroke();
    
    // Canto inferior esquerdo
    context.beginPath();
    context.moveTo(rectX, rectY + rectHeight - cornerSize);
    context.lineTo(rectX, rectY + rectHeight);
    context.lineTo(rectX + cornerSize, rectY + rectHeight);
    context.stroke();
    
    // Canto inferior direito
    context.beginPath();
    context.moveTo(rectX + rectWidth - cornerSize, rectY + rectHeight);
    context.lineTo(rectX + rectWidth, rectY + rectHeight);
    context.lineTo(rectX + rectWidth, rectY + rectHeight - cornerSize);
    context.stroke();
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
  const reset = useCallback(() => {
    setGabaritoData(null);
    setCorrecaoResults([]);
    setScore(null);
    if (overlayCanvasRef.current) {
      const context = overlayCanvasRef.current.getContext('2d');
      if (context) {
        context.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Corretor Inteligente
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
            <canvas
              ref={overlayCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Controles */}
          <div className="flex justify-center gap-2">
            {!isScanning ? (
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
                <CheckCircle className="w-4 h-4" />
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
                {scanningStatus && (
                  <p className="text-xs text-blue-600">
                    {scanningStatus}
                  </p>
                )}
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
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
  );
}