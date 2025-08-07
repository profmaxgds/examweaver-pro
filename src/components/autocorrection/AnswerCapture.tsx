import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AnswerCaptureProps {
  examInfo: any | null;
  onCapture: (file: File) => void;
  startCamera: (mode: 'photo') => void;
  stopCamera: () => void;
  resetToStart: () => void;
}

export function AnswerCapture({ examInfo, onCapture, startCamera, stopCamera, resetToStart }: AnswerCaptureProps) {
  const [useCamera, setUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showAlignmentOverlay, setShowAlignmentOverlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (useCamera && videoRef.current) {
      startCamera('photo');
      if (examInfo?.bubbleCoordinates) {
        setShowAlignmentOverlay(true);
        toast({
          title: "🎯 Coordenadas Ativas",
          description: "Posicione a prova usando os pontos de referência verdes para precisão máxima",
          duration: 4000,
        });
      } else {
        toast({
          title: "📷 Modo Manual",
          description: "Posicione a prova e clique em 'Capturar' quando estiver alinhada",
          duration: 4000,
        });
      }
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
    };
  }, [useCamera, cameraStream, startCamera, examInfo]);

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch((error) => {
        console.error('Erro ao reproduzir vídeo:', error);
        toast({ title: "Erro", description: "Não foi possível reproduzir o vídeo da câmera.", variant: "destructive" });
      });
    }
  }, [cameraStream]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !cameraStream) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        stopCamera();
        setUseCamera(false);
        toast({ title: "Foto capturada!", description: "Pronto para correção." });
      }
    }, 'image/jpeg', 0.8);
  };

  return (
    <Card
      className="p-6 border-2 border-dashed border-green-300 hover:border-green-500 transition-colors cursor-pointer touch-manipulation"
      onClick={() => setUseCamera(true)}
    >
      <CardContent className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <Camera className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-green-900">Capturar Resposta</h3>
          <p className="text-sm text-green-600">Tirar foto da folha de resposta</p>
          <p className="text-xs text-gray-500 mt-1">🎯 Alinhamento com coordenadas</p>
        </div>
      </CardContent>
      {useCamera && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center space-x-2">
              <Camera className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium">Modo Captura</span>
            </div>
            <Button onClick={() => { stopCamera(); setUseCamera(false); }} variant="outline" size="sm">Fechar</Button>
          </div>
          <div className="relative w-full max-w-sm mx-auto">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border bg-black" style={{ aspectRatio: '4/3' }} />
            {showAlignmentOverlay && examInfo?.bubbleCoordinates && (
              <div className="absolute inset-0">
                {Object.entries(examInfo.bubbleCoordinates).map(([questionId, questionData]: [string, any]) =>
                  Object.entries(questionData.bubbles || questionData).map(([option, coords]: [string, any]) => {
                    const videoElement = videoRef.current;
                    if (!videoElement) return null;
                    const videoWidth = videoElement.clientWidth;
                    const videoHeight = videoElement.clientHeight;
                    const scaleX = videoWidth / 595;
                    const scaleY = videoHeight / 842;
                    const x = (coords.x || 0) * scaleX;
                    const y = (coords.y || 0) * scaleY;
                    const size = 12 * Math.min(scaleX, scaleY);
                    return (
                      <div
                        key={`${questionId}-${option}`}
                        className="absolute border-2 border-green-400 bg-green-400/20 rounded-full"
                        style={{
                          left: `${x - size/2}px`,
                          top: `${y - size/2}px`,
                          width: `${size}px`,
                          height: `${size}px`,
                        }}
                      >
                        <span className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs text-green-600 bg-white/80 px-1 rounded">
                          {questionId}{option}
                        </span>
                      </div>
                    );
                  })
                ).flat()}
                <p className="absolute bottom-2 left-2 text-xs text-green-600 bg-white/90 px-2 py-1 rounded">
                  🎯 {Object.keys(examInfo.bubbleCoordinates).length} regiões de resposta mapeadas
                </p>
              </div>
            )}
            <p className="absolute bottom-2 left-0 right-0 text-xs text-green-600 text-center bg-black/50 text-white py-1">
              Alinhe a folha de respostas
            </p>
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="flex justify-center space-x-4">
            <Button onClick={capturePhoto} className="bg-green-600 hover:bg-green-700 text-white" size="lg">
              <Camera className="w-4 h-4 mr-2" /> Capturar
            </Button>
            <Button onClick={resetToStart} variant="outline">Cancelar</Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}