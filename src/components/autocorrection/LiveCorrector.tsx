import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VisionEngine } from './VisionEngine';
import { Camera, Square, CheckCircle, XCircle, AlertCircle, Save, RotateCcw } from 'lucide-react';

interface LayoutData {
  pageDimensions: any;
  bubbleDimensions: any;
  fieldBlocks: Record<string, any>;
  anchors: any[];
}

interface QuestionStatus {
  leituraEstavel: string | null;
  contagem: number;
  status: 'PENDENTE' | 'CORRETA' | 'ERRADA' | 'ANULADA';
}

interface CorrectionResults {
  [questionId: string]: {
    correctAnswer: string;
    detectedAnswer: string;
    status: 'CORRETA' | 'ERRADA' | 'ANULADA';
    confidence: number;
  };
}

interface LiveCorrectorProps {
  layoutData: LayoutData;
  correctAnswers: Record<string, string>;
  onCorrectionComplete: (results: CorrectionResults, screenshots: { feedback: string; original: string }) => void;
}

export const LiveCorrector = ({ 
  layoutData, 
  correctAnswers, 
  onCorrectionComplete 
}: LiveCorrectorProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionEngineRef = useRef<VisionEngine>(new VisionEngine());
  
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<'CORRIGINDO' | 'CONFIRMANDO'>('CORRIGINDO');
  const [questionStatus, setQuestionStatus] = useState<Record<string, QuestionStatus>>({});
  const [fillingData, setFillingData] = useState<Record<string, Record<string, number>>>({});
  const [detectedAnchors, setDetectedAnchors] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<{ feedback: string; original: string } | null>(null);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, nullified: 0 });

  const MARKING_THRESHOLD = 0.51;
  const CONFIRMATION_FRAMES = 15;

  // Inicializar status das questões
  useEffect(() => {
    const initialStatus: Record<string, QuestionStatus> = {};
    Object.keys(correctAnswers).forEach(questionId => {
      initialStatus[questionId] = {
        leituraEstavel: null,
        contagem: 0,
        status: 'PENDENTE'
      };
    });
    setQuestionStatus(initialStatus);
  }, [correctAnswers]);

  // Iniciar câmera
  const startCamera = useCallback(async () => {
    try {
      console.log('🎥 Iniciando câmera...');
      
      // Verificar se a API está disponível
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('API de câmera não suportada neste navegador');
      }

      const constraints = {
        video: { 
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'environment', // Câmera traseira
          frameRate: { ideal: 30 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Stream obtido:', stream);
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('🎬 Stream definido no elemento de vídeo');
        
        // Aguardar o vídeo carregar e reproduzir
        videoRef.current.onloadedmetadata = () => {
          console.log('📺 Metadados carregados');
          if (videoRef.current) {
            videoRef.current.play()
              .then(() => {
                console.log('▶️ Vídeo reproduzindo');
                setIsActive(true);
              })
              .catch(err => {
                console.error('❌ Erro ao reproduzir vídeo:', err);
              });
          }
        };
      }
    } catch (error) {
      console.error('❌ Erro ao acessar câmera:', error);
      
      let errorMessage = 'Erro ao acessar a câmera';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Permissão negada. Clique no ícone de câmera na barra do navegador e permita o acesso.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'Nenhuma câmera encontrada no dispositivo.';
        } else if (error.name === 'NotSupportedError') {
          errorMessage = 'Câmera não suportada neste navegador.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Câmera está sendo usada por outro aplicativo.';
        }
      }
      
      alert(errorMessage);
    }
  }, []);

  // Parar câmera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Resetar status das questões
  const resetQuestionStatus = useCallback(() => {
    const resetStatus: Record<string, QuestionStatus> = {};
    Object.keys(correctAnswers).forEach(questionId => {
      resetStatus[questionId] = {
        leituraEstavel: null,
        contagem: 0,
        status: 'PENDENTE'
      };
    });
    setQuestionStatus(resetStatus);
    setStats({ correct: 0, incorrect: 0, nullified: 0 });
  }, [correctAnswers]);

  // Processar frame da câmera
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || phase !== 'CORRIGINDO') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const visionEngine = visionEngineRef.current;

    // Detectar e alinhar gabarito
    const alignResult = visionEngine.alignAnswerSheet(imageData, layoutData);

    if (alignResult.success && alignResult.transformMatrix && alignResult.contentOffset) {
      setDetectedAnchors(alignResult.detectedPoints || []);

      // Simular imagem alinhada (em produção seria aplicada a transformação perspectiva)
      const alignedImageData = imageData; // Placeholder
      
      // Ler respostas
      const currentFillingData = visionEngine.readAnswersFromAlignedImage(
        alignedImageData, 
        layoutData, 
        alignResult.contentOffset
      );
      
      setFillingData(currentFillingData);

      // Processar respostas detectadas
      const detectedAnswers: Record<string, string> = {};
      Object.entries(currentFillingData).forEach(([questionId, bubbles]) => {
        let answer = '';
        Object.entries(bubbles).forEach(([option, percentage]) => {
          if (percentage > MARKING_THRESHOLD) {
            answer += option;
          }
        });
        detectedAnswers[questionId] = answer;
      });

      // Atualizar status das questões
      setQuestionStatus(prevStatus => {
        const newStatus = { ...prevStatus };
        let statsUpdate = { correct: 0, incorrect: 0, nullified: 0 };

        Object.entries(correctAnswers).forEach(([questionId, correctAnswer]) => {
          if (newStatus[questionId].status !== 'PENDENTE') {
            // Contar estatísticas dos já confirmados
            if (newStatus[questionId].status === 'CORRETA') statsUpdate.correct++;
            else if (newStatus[questionId].status === 'ERRADA') statsUpdate.incorrect++;
            else if (newStatus[questionId].status === 'ANULADA') statsUpdate.nullified++;
            return;
          }

          const currentReading = detectedAnswers[questionId] || '';

          if (currentReading === newStatus[questionId].leituraEstavel) {
            newStatus[questionId].contagem++;
          } else {
            newStatus[questionId].leituraEstavel = currentReading;
            newStatus[questionId].contagem = 1;
          }

          if (newStatus[questionId].contagem >= CONFIRMATION_FRAMES) {
            const confirmedReading = newStatus[questionId].leituraEstavel!;
            
            if (confirmedReading.length === 0) {
              newStatus[questionId].status = 'ERRADA';
              statsUpdate.incorrect++;
            } else if (confirmedReading.length > 1) {
              newStatus[questionId].status = 'ANULADA';
              statsUpdate.nullified++;
            } else if (confirmedReading === correctAnswer) {
              newStatus[questionId].status = 'CORRETA';
              statsUpdate.correct++;
            } else {
              newStatus[questionId].status = 'ERRADA';
              statsUpdate.incorrect++;
            }

            console.log(`Status confirmado para ${questionId}: ${newStatus[questionId].status} (${confirmedReading})`);
          }
        });

        setStats(statsUpdate);
        return newStatus;
      });

      // Verificar se todas as questões foram processadas
      const allProcessed = Object.values(questionStatus).every(q => q.status !== 'PENDENTE');
      if (allProcessed && phase === 'CORRIGINDO') {
        console.log('Leitura estabilizada. Preparando para confirmação...');
        captureScreenshots();
        setPhase('CONFIRMANDO');
      }
    } else {
      // Resetar se não conseguir detectar
      resetQuestionStatus();
      setDetectedAnchors([]);
    }
  }, [layoutData, correctAnswers, questionStatus, phase, resetQuestionStatus]);

  // Capturar screenshots
  const captureScreenshots = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const feedbackCanvas = document.createElement('canvas');
    const feedbackCtx = feedbackCanvas.getContext('2d')!;
    
    feedbackCanvas.width = canvas.width;
    feedbackCanvas.height = canvas.height;
    feedbackCtx.drawImage(canvas, 0, 0);

    // Desenhar feedback visual no canvas
    drawFeedbackOverlay(feedbackCtx, feedbackCanvas.width, feedbackCanvas.height);

    const feedbackDataUrl = feedbackCanvas.toDataURL('image/png');
    const originalDataUrl = canvas.toDataURL('image/png');

    setScreenshots({
      feedback: feedbackDataUrl,
      original: originalDataUrl
    });
  }, [questionStatus, correctAnswers, detectedAnchors]);

  // Desenhar overlay de feedback
  const drawFeedbackOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Desenhar âncoras detectadas
    detectedAnchors.forEach(point => {
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Desenhar feedback das questões
    Object.entries(questionStatus).forEach(([questionId, status]) => {
      if (status.status === 'PENDENTE') return;

      const fieldInfo = layoutData.fieldBlocks[questionId];
      if (!fieldInfo?.bubbleCoordinates) return;

      const correctAnswer = correctAnswers[questionId];
      
      fieldInfo.bubbleCoordinates.forEach((bubble: any) => {
        let color = '';
        if (bubble.value === correctAnswer) {
          color = 'rgba(0, 255, 0, 0.6)'; // Verde para resposta correta
        } else if (status.leituraEstavel?.includes(bubble.value)) {
          if (status.status === 'ERRADA') color = 'rgba(255, 0, 0, 0.6)'; // Vermelho para erro
          else if (status.status === 'ANULADA') color = 'rgba(255, 165, 0, 0.6)'; // Laranja para anulada
        }

        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(bubble.x, bubble.y, bubble.width, bubble.height);
        }
      });
    });

    // Desenhar estatísticas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 200, 100);
    
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText(`Acertos: ${stats.correct}`, 20, 35);
    ctx.fillText(`Erros: ${stats.incorrect}`, 20, 55);
    ctx.fillText(`Anuladas: ${stats.nullified}`, 20, 75);
  };

  // Confirmar correção
  const handleConfirmCorrection = useCallback(() => {
    const results: CorrectionResults = {};
    
    Object.entries(questionStatus).forEach(([questionId, status]) => {
      results[questionId] = {
        correctAnswer: correctAnswers[questionId],
        detectedAnswer: status.leituraEstavel || '',
        status: status.status as any,
        confidence: status.contagem / CONFIRMATION_FRAMES
      };
    });

    if (screenshots) {
      onCorrectionComplete(results, screenshots);
    }
    
    stopCamera();
  }, [questionStatus, correctAnswers, screenshots, onCorrectionComplete, stopCamera]);

  // Tentar novamente
  const handleRetry = useCallback(() => {
    setPhase('CORRIGINDO');
    setScreenshots(null);
    resetQuestionStatus();
  }, [resetQuestionStatus]);

  // Loop de processamento
  useEffect(() => {
    if (!isActive || phase !== 'CORRIGINDO') return;

    const interval = setInterval(processFrame, 100); // 10 FPS
    return () => clearInterval(interval);
  }, [isActive, phase, processFrame]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CORRETA': return 'bg-green-500';
      case 'ERRADA': return 'bg-red-500';
      case 'ANULADA': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CORRETA': return <CheckCircle className="w-4 h-4" />;
      case 'ERRADA': return <XCircle className="w-4 h-4" />;
      case 'ANULADA': return <AlertCircle className="w-4 h-4" />;
      default: return <Square className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Corretor ao Vivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isActive ? (
            <div className="text-center py-8">
              <div className="space-y-4">
                <Button onClick={startCamera} className="mb-4">
                  <Camera className="w-4 h-4 mr-2" />
                  Iniciar Câmera
                </Button>
                <p className="text-muted-foreground">
                  Clique para iniciar a correção automática
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Certifique-se de permitir o acesso à câmera quando solicitado
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Área de vídeo */}
              <div className="relative">
                <video
                  ref={videoRef}
                  className="w-full max-w-md mx-auto border rounded-lg"
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{
                    maxHeight: '400px',
                    objectFit: 'cover'
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {phase === 'CORRIGINDO' && (
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="bg-black/70 text-white p-2 rounded text-sm">
                      {detectedAnchors.length === 4 ? (
                        'Gabarito detectado - Lendo respostas...'
                      ) : (
                        'Posicione o gabarito para que os 4 pontos sejam detectados'
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Estatísticas */}
              <div className="flex gap-2 justify-center">
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Acertos: {stats.correct}
                </Badge>
                <Badge variant="secondary" className="bg-red-100 text-red-800">
                  <XCircle className="w-3 h-3 mr-1" />
                  Erros: {stats.incorrect}
                </Badge>
                {stats.nullified > 0 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Anuladas: {stats.nullified}
                  </Badge>
                )}
              </div>

              {/* Status das questões */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {Object.entries(questionStatus).map(([questionId, status]) => (
                  <Badge
                    key={questionId}
                    variant="secondary"
                    className={`flex items-center gap-1 ${getStatusColor(status.status)} text-white`}
                  >
                    {getStatusIcon(status.status)}
                    {questionId.replace('Q', '')}
                  </Badge>
                ))}
              </div>

              {/* Controles */}
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={resetQuestionStatus}
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Resetar
                </Button>
                <Button
                  variant="destructive"
                  onClick={stopCamera}
                >
                  Parar Câmera
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de confirmação */}
      {phase === 'CONFIRMANDO' && screenshots && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar Correção</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Resultado Final</h4>
                <img 
                  src={screenshots.feedback} 
                  alt="Resultado com feedback"
                  className="w-full border rounded"
                />
              </div>
              <div>
                <h4 className="font-medium mb-2">Área de Respostas Capturada</h4>
                <img 
                  src={screenshots.original} 
                  alt="Captura original"
                  className="w-full border rounded"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-center">
              <Button
                onClick={handleConfirmCorrection}
                className="flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Confirmar e Salvar
              </Button>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Tentar Novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};