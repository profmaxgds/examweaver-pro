import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, FileImage, Loader2, Eye, PenTool, Sparkles } from 'lucide-react';
import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

interface HandwrittenOCRProps {
  onTextExtracted: (text: string) => void;
  question: any;
  isProcessing?: boolean;
}

export function HandwrittenOCR({ onTextExtracted, question, isProcessing = false }: HandwrittenOCRProps) {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Iniciar câmera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      setCameraStream(stream);
      setUseCamera(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      toast({
        title: "📷 Câmera ativa!",
        description: "Posicione a resposta manuscrita para capturar",
      });
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      toast({
        title: "Erro de Câmera",
        description: "Não foi possível acessar a câmera.",
        variant: "destructive",
      });
    }
  };

  // Parar câmera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUseCamera(false);
  };

  // Capturar foto da câmera
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    if (context) {
      context.drawImage(video, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], `handwritten_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedImage(file);
          
          const previewUrl = URL.createObjectURL(blob);
          setPreviewUrl(previewUrl);
          
          stopCamera();
          
          toast({
            title: "Foto capturada!",
            description: "Agora clique em 'Extrair Texto' para processar",
          });
        }
      }, 'image/jpeg', 0.8);
    }
  };

  // Processar arquivo selecionado
  const handleFileSelect = (file: File) => {
    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    toast({
      title: "Imagem carregada!",
      description: "Clique em 'Extrair Texto' para processar a caligrafia",
    });
  };

  // Extrair texto usando TrOCR
  const extractText = async () => {
    if (!selectedImage) {
      toast({
        title: "Erro",
        description: "Selecione uma imagem primeiro",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    
    try {
      toast({
        title: "🤖 Processando...",
        description: "Carregando modelo TrOCR para texto manuscrito",
      });

      // Criar pipeline para OCR de texto manuscrito
      const ocr = await pipeline('image-to-text', 'microsoft/trocr-large-handwritten', {
        device: 'webgpu', // Usar WebGPU se disponível
      });

      // Processar a imagem
      const imageUrl = URL.createObjectURL(selectedImage);
      const result = await ocr(imageUrl);
      
      let text = '';
      if (Array.isArray(result)) {
        text = result.map((r: any) => r.generated_text || '').join(' ');
      } else if (result && typeof result === 'object' && 'generated_text' in result) {
        text = (result as any).generated_text || '';
      }
      
      setExtractedText(text);
      onTextExtracted(text);
      
      toast({
        title: "✅ Texto extraído!",
        description: `Detectados ${text.length} caracteres`,
      });

    } catch (error) {
      console.error('Erro no OCR:', error);
      
      // Fallback para Tesseract se TrOCR falhar
      try {
        toast({
          title: "🔄 Usando OCR alternativo...",
          description: "TrOCR não disponível, usando Tesseract",
        });

        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('por');
        
        const imageUrl = URL.createObjectURL(selectedImage);
        const { data: { text } } = await worker.recognize(imageUrl);
        
        await worker.terminate();
        
        setExtractedText(text);
        onTextExtracted(text);
        
        toast({
          title: "✅ Texto extraído (OCR alternativo)!",
          description: `Detectados ${text.length} caracteres`,
        });
        
      } catch (fallbackError) {
        console.error('Erro no OCR fallback:', fallbackError);
        toast({
          title: "Erro",
          description: "Não foi possível extrair texto da imagem",
          variant: "destructive",
        });
      }
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <Card className="border-2 border-dashed border-purple-300 hover:border-purple-500 transition-colors">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenTool className="h-5 w-5 text-purple-600" />
          OCR para Texto Manuscrito
          <Badge variant="outline" className="ml-auto">
            <Sparkles className="w-3 h-3 mr-1" />
            TrOCR AI
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Informações da questão */}
        <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
          <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
            {question.title}
          </p>
          <p className="text-xs text-purple-600 mt-1">
            {question.points} pontos • Questão Aberta
          </p>
        </div>

        {/* Captura de imagem */}
        {!useCamera ? (
          <div className="space-y-3">
            {/* Botões de captura */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                onClick={startCamera}
                variant="outline"
                className="h-auto p-4"
                disabled={isProcessing}
              >
                <div className="text-center">
                  <Camera className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                  <div className="text-sm font-medium">Capturar com Câmera</div>
                  <div className="text-xs text-muted-foreground">Foto da resposta</div>
                </div>
              </Button>

              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="h-auto p-4"
                disabled={isProcessing}
              >
                <div className="text-center">
                  <FileImage className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                  <div className="text-sm font-medium">Enviar Arquivo</div>
                  <div className="text-xs text-muted-foreground">JPG, PNG, HEIC</div>
                </div>
              </Button>
            </div>

            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg border bg-black"
                style={{ aspectRatio: '16/9' }}
              />
              
              {/* Guia visual para texto manuscrito */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  <div className="w-80 h-32 border-4 border-purple-500 rounded-lg bg-purple-500/10 animate-pulse">
                    <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-purple-400"></div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-purple-400"></div>
                    <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-purple-400"></div>
                    <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-purple-400"></div>
                    
                    {/* Indicador de texto */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PenTool className="w-8 h-8 text-purple-400/60" />
                    </div>
                  </div>
                  <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-xs text-purple-300 font-bold bg-black/50 px-2 py-1 rounded text-center">
                    Posicione a resposta manuscrita aqui
                  </div>
                </div>
              </div>
            </div>
            
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            <div className="flex gap-2 justify-center">
              <Button onClick={capturePhoto} className="bg-purple-600 hover:bg-purple-700">
                <Camera className="w-4 h-4 mr-2" />
                Capturar Resposta
              </Button>
              <Button variant="outline" onClick={stopCamera}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Preview da imagem */}
        {previewUrl && (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm font-medium mb-2">Imagem capturada:</p>
              <img 
                src={previewUrl} 
                alt="Resposta manuscrita" 
                className="max-w-full max-h-48 rounded border mx-auto"
              />
            </div>
            
            <Button
              onClick={extractText}
              disabled={isExtracting}
              className="w-full bg-purple-600 hover:bg-purple-700"
              size="lg"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extraindo texto com IA...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Extrair Texto Manuscrito
                </>
              )}
            </Button>
          </div>
        )}

        {/* Texto extraído */}
        {extractedText && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  Texto Extraído:
                </span>
              </div>
              <Textarea
                value={extractedText}
                onChange={(e) => {
                  setExtractedText(e.target.value);
                  onTextExtracted(e.target.value);
                }}
                placeholder="Texto extraído aparecerá aqui..."
                className="min-h-20 bg-white dark:bg-black"
              />
              <p className="text-xs text-green-600 mt-1">
                ✏️ Você pode editar o texto se necessário
              </p>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🤖 <strong>IA TrOCR:</strong> Especializada em texto manuscrito</p>
          <p>📱 Suporte para HEIC, JPG, PNG • ⚡ Processamento local no navegador</p>
        </div>
      </CardContent>
    </Card>
  );
}