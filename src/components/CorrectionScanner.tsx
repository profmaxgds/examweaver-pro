import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Eye, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { FileUpload } from './FileUpload';

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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
            <div className="flex space-x-2">
              <Button onClick={startCamera} className="flex-1">
                <Camera className="w-4 h-4 mr-2" />
                Usar Câmera
              </Button>
            </div>
            
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
            </div>
            <div className="flex space-x-2">
              <Button onClick={capturePhoto} className="flex-1">
                Capturar Foto
              </Button>
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
              <Button variant="outline" onClick={reset}>
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
                      item.isCorrect ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    Questão {item.questionNumber}: {item.studentAnswer || 'Sem resposta'} 
                    {item.isCorrect ? ' ✓' : ' ✗'} ({item.points}/{item.maxPoints} pts)
                  </div>
                ))}
              </div>
            </div>

            <Button variant="outline" onClick={reset} className="w-full">
              Processar Nova Correção
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}