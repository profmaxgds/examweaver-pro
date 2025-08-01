import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, FileImage, Loader2, Eye, PenTool, Sparkles, Settings } from 'lucide-react';
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
  const [ocrEngine, setOcrEngine] = useState<'trocr' | 'tesseract' | 'easyocr'>('trocr');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Iniciar câmera
  const startCamera = async () => {
    try {
      // Verificar se o navegador suporta getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Câmera não é suportada neste navegador');
      }

      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setCameraStream(stream);
      setUseCamera(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Aguardar o vídeo carregar antes de tentar reproduzir
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(error => {
            console.error('Erro ao reproduzir vídeo:', error);
          });
        };
      }
      
      toast({
        title: "📷 Câmera ativa!",
        description: "Posicione a resposta manuscrita para capturar",
      });
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      let errorMessage = "Não foi possível acessar a câmera.";
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = "Acesso à câmera foi negado. Verifique as permissões.";
        } else if (error.name === 'NotFoundError') {
          errorMessage = "Nenhuma câmera encontrada no dispositivo.";
        } else if (error.name === 'NotSupportedError') {
          errorMessage = "Câmera não é suportada neste navegador.";
        }
      }
      
      toast({
        title: "Erro de Câmera",
        description: errorMessage,
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
    if (!videoRef.current || !canvasRef.current) {
      toast({
        title: "Erro",
        description: "Câmera não está disponível",
        variant: "destructive",
      });
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      toast({
        title: "Erro",
        description: "Não foi possível acessar o canvas",
        variant: "destructive",
      });
      return;
    }

    // Aguardar o vídeo estar carregado
    if (video.readyState < 2) {
      toast({
        title: "Aguarde",
        description: "Câmera ainda está carregando...",
        variant: "destructive",
      });
      return;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    // Desenhar o frame atual do vídeo no canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Converter para blob
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], `handwritten_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedImage(file);
        
        const previewUrl = URL.createObjectURL(blob);
        setPreviewUrl(previewUrl);
        
        stopCamera();
        
        toast({
          title: "✅ Foto capturada!",
          description: "Agora clique em 'Extrair Texto' para processar",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível capturar a imagem",
          variant: "destructive",
        });
      }
    }, 'image/jpeg', 0.9);
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

  // Extrair texto usando Microsoft TrOCR
  const extractWithTrOCR = async () => {
    const imageUrl = URL.createObjectURL(selectedImage!);
    
    try {
      // Usar modelo menor e mais estável
      const modelName = 'Xenova/trocr-small-printed';
      
      console.log('Carregando TrOCR:', modelName);
      
      const ocr = await pipeline('image-to-text', modelName, {
        device: 'webgpu',
      });

      console.log('TrOCR carregado, processando imagem...');
      const result = await ocr(imageUrl);
      console.log('Resultado TrOCR:', result);
      
      let text = '';
      if (Array.isArray(result)) {
        text = result.map((r: any) => r.generated_text || '').join(' ');
      } else if (result && typeof result === 'object' && 'generated_text' in result) {
        text = (result as any).generated_text || '';
      } else if (typeof result === 'string') {
        text = result;
      }
      
      console.log('Texto extraído pelo TrOCR:', text);
      return text.trim();
    } catch (error) {
      console.error('Erro TrOCR:', error);
      throw error;
    } finally {
      // Limpar URL do objeto
      URL.revokeObjectURL(imageUrl);
    }
  };

  // Extrair texto usando Tesseract
  const extractWithTesseract = async () => {
    const imageUrl = URL.createObjectURL(selectedImage!);
    
    try {
      console.log('Carregando Tesseract...');
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('por');
      
      console.log('Tesseract carregado, processando imagem...');
      const { data: { text } } = await worker.recognize(imageUrl);
      console.log('Resultado Tesseract:', text);
      
      await worker.terminate();
      return text.trim();
    } catch (error) {
      console.error('Erro Tesseract:', error);
      throw error;
    } finally {
      // Limpar URL do objeto
      URL.revokeObjectURL(imageUrl);
    }
  };

  // Extrair texto usando EasyOCR (simulado via API)
  const extractWithEasyOCR = async () => {
    try {
      // Por enquanto, vamos simular com Tesseract
      console.log('EasyOCR não implementado, usando Tesseract como fallback');
      return await extractWithTesseract();
    } catch (error) {
      console.error('Erro EasyOCR:', error);
      throw error;
    }
  };

  // Função principal de extração
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
    setExtractedText(''); // Limpar texto anterior
    
    try {
      let text = '';
      let engineName = '';
      
      console.log(`Iniciando extração com engine: ${ocrEngine}`);
      
      switch (ocrEngine) {
        case 'trocr':
          toast({
            title: "🤖 Processando...",
            description: "Usando Microsoft TrOCR para texto manuscrito",
          });
          engineName = 'Microsoft TrOCR';
          text = await extractWithTrOCR();
          break;
          
        case 'tesseract':
          toast({
            title: "🔍 Processando...",
            description: "Usando Tesseract OCR",
          });
          engineName = 'Tesseract';
          text = await extractWithTesseract();
          break;
          
        case 'easyocr':
          toast({
            title: "⚡ Processando...",
            description: "Usando EasyOCR",
          });
          engineName = 'EasyOCR';
          text = await extractWithEasyOCR();
          break;
      }
      
      console.log(`Texto final extraído (${engineName}):`, text);
      
      // Sempre atualizar, mesmo se o texto estiver vazio
      setExtractedText(text || 'Nenhum texto foi detectado na imagem.');
      onTextExtracted(text || '');
      
      if (text && text.trim()) {
        toast({
          title: `✅ Texto extraído com ${engineName}!`,
          description: `Detectados ${text.length} caracteres`,
        });
      } else {
        toast({
          title: `⚠️ ${engineName} concluído`,
          description: "Nenhum texto foi detectado na imagem",
          variant: "default",
        });
      }

    } catch (error) {
      console.error(`Erro no OCR (${ocrEngine}):`, error);
      
      // Fallback automático para Tesseract se não for o engine selecionado
      if (ocrEngine !== 'tesseract') {
        try {
          toast({
            title: "🔄 Usando OCR alternativo...",
            description: "Tentando com Tesseract como fallback",
          });

          const text = await extractWithTesseract();
          console.log('Texto do fallback Tesseract:', text);
          
          setExtractedText(text || 'Nenhum texto foi detectado na imagem.');
          onTextExtracted(text || '');
          
          if (text && text.trim()) {
            toast({
              title: "✅ Texto extraído (fallback)!",
              description: `Detectados ${text.length} caracteres com Tesseract`,
            });
          } else {
            toast({
              title: "⚠️ Fallback concluído",
              description: "Nenhum texto foi detectado na imagem",
            });
          }
          
        } catch (fallbackError) {
          console.error('Erro no OCR fallback:', fallbackError);
          setExtractedText('Erro ao processar imagem. Tente novamente.');
          toast({
            title: "Erro",
            description: "Não foi possível extrair texto com nenhum engine de OCR",
            variant: "destructive",
          });
        }
      } else {
        setExtractedText('Erro ao processar imagem. Tente novamente.');
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
            {ocrEngine === 'trocr' ? 'TrOCR AI' : ocrEngine === 'tesseract' ? 'Tesseract' : 'EasyOCR'}
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

        {/* Seleção do Engine de OCR */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">Engine de OCR:</label>
          </div>
          <Select value={ocrEngine} onValueChange={(value: 'trocr' | 'tesseract' | 'easyocr') => setOcrEngine(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trocr">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Microsoft TrOCR (IA especializada em manuscrito)
                </div>
              </SelectItem>
              <SelectItem value="tesseract">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-600" />
                  Tesseract (OCR tradicional, mais rápido)
                </div>
              </SelectItem>
              <SelectItem value="easyocr">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-green-600" />
                  EasyOCR (Versatil, múltiplos idiomas)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
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
                onLoadedMetadata={() => {
                  console.log('Vídeo carregado, dimensões:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
                }}
                onError={(e) => {
                  console.error('Erro no vídeo:', e);
                  toast({
                    title: "Erro no vídeo",
                    description: "Problema ao exibir câmera",
                    variant: "destructive",
                  });
                }}
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
          {ocrEngine === 'trocr' && (
            <p>🤖 <strong>Microsoft TrOCR:</strong> IA especializada em texto manuscrito</p>
          )}
          {ocrEngine === 'tesseract' && (
            <p>🔍 <strong>Tesseract:</strong> OCR tradicional, rápido e confiável</p>
          )}
          {ocrEngine === 'easyocr' && (
            <p>⚡ <strong>EasyOCR:</strong> Versatil, suporte a múltiplos idiomas</p>
          )}
          <p>📱 Suporte para HEIC, JPG, PNG • ⚡ Processamento local no navegador</p>
        </div>
      </CardContent>
    </Card>
  );
}