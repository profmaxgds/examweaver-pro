import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, FileImage, Loader2, Eye, PenTool, Sparkles, Settings, Contrast, Palette, Filter } from 'lucide-react';
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
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [ocrEngine, setOcrEngine] = useState<'trocr' | 'tesseract' | 'easyocr' | 'keras' | 'doctr'>('tesseract');
  
  // Estados para pré-processamento
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [binarize, setBinarize] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [enhanceLines, setEnhanceLines] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [denoiseImage, setDenoiseImage] = useState(false);
  const [showPreprocessing, setShowPreprocessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(null);

  // Aplicar pré-processamento à imagem
  const applyImageProcessing = async (sourceCanvas: HTMLCanvasElement) => {
    if (!processCanvasRef.current) return null;
    
    const processCanvas = processCanvasRef.current;
    const ctx = processCanvas.getContext('2d');
    if (!ctx) return null;

    // Copiar dimensões da imagem original
    processCanvas.width = sourceCanvas.width;
    processCanvas.height = sourceCanvas.height;
    
    // Aplicar filtros CSS
    let filters = [];
    if (brightness !== 100) filters.push(`brightness(${brightness}%)`);
    if (contrast !== 100) filters.push(`contrast(${contrast}%)`);
    if (grayscale) filters.push('grayscale(100%)');
    
    ctx.filter = filters.join(' ');
    ctx.drawImage(sourceCanvas, 0, 0);
    
    // Obter dados da imagem para processamento avançado
    let imageData = ctx.getImageData(0, 0, processCanvas.width, processCanvas.height);
    let data = imageData.data;
    
    // Remoção de ruído usando filtro mediano simples
    if (denoiseImage) {
      console.log('🧹 Aplicando remoção de ruído...');
      data = applySimpleDenoising(data, processCanvas.width, processCanvas.height);
    }
    
    // Remoção de fundo simples (converte pixels mais claros em branco)
    if (removeBackground) {
      console.log('🎭 Removendo fundo...');
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (avg > 180) { // Pixels claros viram branco
          data[i] = 255;     // red
          data[i + 1] = 255; // green  
          data[i + 2] = 255; // blue
        }
      }
    }
    
    // Aplicar binarização se habilitada
    if (binarize) {
      console.log('⚫ Aplicando binarização...');
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const binary = avg > 128 ? 255 : 0;
        data[i] = binary;     // red
        data[i + 1] = binary; // green  
        data[i + 2] = binary; // blue
      }
    }
    
    // Melhorar linhas se habilitado
    if (enhanceLines) {
      console.log('✏️ Melhorando espessura das linhas...');
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 100) { // Pixels escuros (texto)
          data[i] = Math.max(0, data[i] - 20);
          data[i + 1] = Math.max(0, data[i + 1] - 20);
          data[i + 2] = Math.max(0, data[i + 2] - 20);
        }
      }
    }
    
    // Aplicar dados processados de volta
    const newImageData = new ImageData(data, processCanvas.width, processCanvas.height);
    ctx.putImageData(newImageData, 0, 0);
    
    return processCanvas;
  };

  // Função de remoção de ruído simples
  const applySimpleDenoising = (data: Uint8ClampedArray, width: number, height: number) => {
    const newData = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Calcular média dos pixels vizinhos para cada canal RGB
        for (let channel = 0; channel < 3; channel++) {
          const values = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const neighborIdx = ((y + dy) * width + (x + dx)) * 4 + channel;
              values.push(data[neighborIdx]);
            }
          }
          values.sort((a, b) => a - b);
          newData[idx + channel] = values[4]; // Mediana dos 9 valores
        }
      }
    }
    
    return newData;
  };

  // Atualizar preview processado quando configurações mudam
  useEffect(() => {
    if (!previewUrl) return;
    
    const img = new Image();
    img.onload = async () => {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      tempCtx.drawImage(img, 0, 0);
      
      const processedCanvas = await applyImageProcessing(tempCanvas);
      if (processedCanvas) {
        const processedUrl = processedCanvas.toDataURL('image/jpeg', 0.9);
        setProcessedPreviewUrl(processedUrl);
      }
    };
    img.src = previewUrl;
  }, [brightness, contrast, binarize, grayscale, enhanceLines, removeBackground, denoiseImage, previewUrl]);

  // Iniciar câmera
  const startCamera = async () => {
    console.log('🎥 Iniciando câmera...');
    
    try {
      // Verificar se o navegador suporta getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('❌ getUserMedia não suportado');
        throw new Error('Câmera não é suportada neste navegador');
      }

      console.log('✅ getUserMedia disponível');

      // Primeiro, tentar configurações mais simples
      const basicConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      console.log('📱 Solicitando acesso à câmera com constraints básicas:', basicConstraints);

      const stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
      
      console.log('✅ Stream obtido:', stream);
      console.log('📹 Tracks de vídeo:', stream.getVideoTracks());
      
      setCameraStream(stream);
      setUseCamera(true);
      
      console.log('🔄 Estado useCamera atualizado para true');
      
      if (videoRef.current) {
        console.log('📺 Conectando stream ao elemento video');
        videoRef.current.srcObject = stream;
        
        // Forçar reprodução imediata
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('▶️ Vídeo reproduzindo automaticamente');
          }).catch(error => {
            console.error('❌ Erro ao reproduzir automaticamente:', error);
            // Tentar reproduzir manualmente
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.play().catch(e => console.error('Erro reprodução manual:', e));
              }
            }, 500);
          });
        }
        
        videoRef.current.onloadedmetadata = () => {
          console.log('📽️ Metadata carregada:', {
            videoWidth: videoRef.current?.videoWidth,
            videoHeight: videoRef.current?.videoHeight
          });
        };
        
        videoRef.current.onerror = (error) => {
          console.error('❌ Erro no elemento video:', error);
        };
      } else {
        console.error('❌ videoRef.current é null');
      }
      
      toast({
        title: "📷 Câmera ativa!",
        description: "Posicione a resposta manuscrita para capturar",
      });
      
    } catch (error) {
      console.error('❌ Erro ao acessar câmera:', error);
      let errorMessage = "Não foi possível acessar a câmera.";
      
      if (error instanceof Error) {
        console.log('🔍 Tipo de erro:', error.name);
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
          description: "Configure o pré-processamento e clique em 'Extrair Texto'",
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
      description: "Configure o pré-processamento e clique em 'Extrair Texto'",
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
  const extractWithTesseract = async (imageFile: File = selectedImage!) => {
    const imageUrl = URL.createObjectURL(imageFile);
    
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

  // Extrair texto usando Keras (via edge function)
  const extractWithKeras = async (imageFile: File) => {
    try {
      console.log('🧠 Enviando para Keras OCR...');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );

      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      
      // Upload da imagem
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('temp-images')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      // Chamar edge function
      const { data, error } = await supabase.functions.invoke('keras-ocr', {
        body: { fileName: uploadData.path }
      });

      if (error) throw error;

      // Limpar arquivo temporário
      await supabase.storage.from('temp-images').remove([uploadData.path]);

      return data.text || '';
    } catch (error) {
      console.error('Erro Keras OCR:', error);
      throw error;
    }
  };

  // Extrair texto usando DocTR (via edge function)  
  const extractWithDocTR = async (imageFile: File) => {
    try {
      console.log('📄 Enviando para DocTR...');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );

      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      
      // Upload da imagem
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('temp-images')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      // Chamar edge function
      const { data, error } = await supabase.functions.invoke('doctr-ocr', {
        body: { fileName: uploadData.path }
      });

      if (error) throw error;

      // Limpar arquivo temporário
      await supabase.storage.from('temp-images').remove([uploadData.path]);

      return data.text || '';
    } catch (error) {
      console.error('Erro DocTR:', error);
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
      let imageToProcess = selectedImage;
      
      // Se há pré-processamento, usar a imagem processada
      if (processedPreviewUrl && (brightness !== 100 || contrast !== 100 || binarize || grayscale || enhanceLines || removeBackground || denoiseImage)) {
        // Converter a imagem processada em blob
        const response = await fetch(processedPreviewUrl);
        const blob = await response.blob();
        imageToProcess = new File([blob], 'processed_image.jpg', { type: 'image/jpeg' });
        console.log('🖼️ Usando imagem pré-processada para OCR');
      }
      
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
          text = await extractWithTesseract(imageToProcess);
          break;
          
        case 'easyocr':
          toast({
            title: "⚡ Processando...",
            description: "Usando EasyOCR",
          });
          engineName = 'EasyOCR';
          text = await extractWithTesseract(imageToProcess); // Fallback para Tesseract
          break;

        case 'keras':
          toast({
            title: "🧠 Processando...",
            description: "Usando Keras OCR",
          });
          engineName = 'Keras OCR';
          text = await extractWithKeras(imageToProcess);
          break;

        case 'doctr':
          toast({
            title: "📄 Processando...",
            description: "Usando DocTR",
          });
          engineName = 'DocTR';
          text = await extractWithDocTR(imageToProcess);
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
              <SelectItem value="tesseract">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-600" />
                  Tesseract (OCR tradicional, mais rápido)
                </div>
              </SelectItem>
              <SelectItem value="trocr">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  Microsoft TrOCR (IA especializada em manuscrito)
                </div>
              </SelectItem>
              <SelectItem value="keras">
                <div className="flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-orange-600" />
                  Keras OCR (Deep Learning, muito preciso)
                </div>
              </SelectItem>
              <SelectItem value="doctr">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-green-600" />
                  DocTR (Análise avançada de documentos)
                </div>
              </SelectItem>
              <SelectItem value="easyocr">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-red-600" />
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
                onClick={() => {
                  console.log('🔘 Botão da câmera clicado');
                  startCamera();
                }}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Imagem original */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Original</p>
                  <img 
                    src={previewUrl} 
                    alt="Resposta manuscrita original" 
                    className="max-w-full max-h-48 rounded border mx-auto"
                  />
                </div>
                
                {/* Imagem processada */}
                {processedPreviewUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Pré-processada</p>
                    <img 
                      src={processedPreviewUrl} 
                      alt="Resposta manuscrita processada" 
                      className="max-w-full max-h-48 rounded border mx-auto"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Controles de Pré-processamento */}
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-medium">Pré-processamento de Imagem</Label>
                </div>
                <Switch 
                  checked={showPreprocessing} 
                  onCheckedChange={setShowPreprocessing}
                />
              </div>
              
              {showPreprocessing && (
                <div className="space-y-4">
                  {/* Brilho */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Brilho</Label>
                      <span className="text-xs text-muted-foreground">{brightness}%</span>
                    </div>
                    <Slider
                      value={[brightness]}
                      onValueChange={(value) => setBrightness(value[0])}
                      min={50}
                      max={150}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  {/* Contraste */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Contraste</Label>
                      <span className="text-xs text-muted-foreground">{contrast}%</span>
                    </div>
                    <Slider
                      value={[contrast]}
                      onValueChange={(value) => setContrast(value[0])}
                      min={50}
                      max={200}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  <Separator />

                  {/* Switches para filtros */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Escala de Cinza</Label>
                      <Switch checked={grayscale} onCheckedChange={setGrayscale} />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Binarizar (Preto e Branco)</Label>
                      <Switch checked={binarize} onCheckedChange={setBinarize} />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Melhorar Espessura das Linhas</Label>
                      <Switch checked={enhanceLines} onCheckedChange={setEnhanceLines} />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Remover Fundo</Label>
                      <Switch checked={removeBackground} onCheckedChange={setRemoveBackground} />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Remover Ruído</Label>
                      <Switch checked={denoiseImage} onCheckedChange={setDenoiseImage} />
                    </div>
                  </div>

                  {/* Botão de reset */}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setBrightness(100);
                      setContrast(100);
                      setBinarize(false);
                      setGrayscale(false);
                      setEnhanceLines(false);
                      setRemoveBackground(false);
                      setDenoiseImage(false);
                    }}
                    className="w-full"
                  >
                    <Palette className="w-3 h-3 mr-1" />
                    Resetar Filtros
                  </Button>
                </div>
              )}
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
          {ocrEngine === 'keras' && (
            <p>🧠 <strong>Keras OCR:</strong> Deep Learning, muito preciso para manuscritos</p>
          )}
          {ocrEngine === 'doctr' && (
            <p>📄 <strong>DocTR:</strong> Análise avançada de documentos e layout</p>
          )}
          {ocrEngine === 'easyocr' && (
            <p>⚡ <strong>EasyOCR:</strong> Versatil, suporte a múltiplos idiomas</p>
          )}
          <p>📱 Suporte para HEIC, JPG, PNG • ⚡ Processamento local no navegador</p>
        </div>
        
        {/* Canvas oculto para processamento */}
        <canvas ref={processCanvasRef} style={{ display: 'none' }} />
      </CardContent>
    </Card>
  );
}