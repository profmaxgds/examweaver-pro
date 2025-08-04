import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle, XCircle, RotateCcw, ArrowLeft, QrCode, Loader2, Scan, Target, Upload } from 'lucide-react';
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
  calibration_points?: Record<string, { x: number; y: number; type?: string }>;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  // Função para converter arquivos HEIC (copiada da AutoCorrectionPage)
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
      try {
        toast({
          title: "Convertendo arquivo HEIC...",
          description: "Processando imagem do iPhone/iPad",
        });

        const heic2any = (await import('heic2any')).default;
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8
        }) as Blob;

        return new File([convertedBlob], file.name.replace(/\.heic$/i, '.jpg'), {
          type: 'image/jpeg'
        });
      } catch (error) {
        console.error('Erro ao converter HEIC:', error);
        throw new Error('Erro ao converter arquivo HEIC. Tente um formato diferente.');
      }
    }
    return file;
  };

  // Função para ler QR code de arquivo ultra-robusta (copiada da AutoCorrectionPage)
  const readQRCodeFromFile = async (file: File): Promise<string | null> => {
    try {
      const processedFile = await convertHeicToJpeg(file);
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) {
              resolve(null);
              return;
            }

            // Usar resolução alta para arquivo
            const maxSize = 1200;
            let { width, height } = img;
            
            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;
            context.drawImage(img, 0, 0, width, height);
            
            const imageData = context.getImageData(0, 0, width, height);
            
            // Tentar múltiplas configurações agressivamente (copiado da AutoCorrectionPage)
            const configurations = [
              { inversionAttempts: "dontInvert" as const },
              { inversionAttempts: "onlyInvert" as const },
              { inversionAttempts: "attemptBoth" as const },
              { inversionAttempts: "invertFirst" as const }
            ];

            for (const config of configurations) {
              try {
                const code = jsQR(imageData.data, imageData.width, imageData.height, config);
                if (code && code.data && code.data.trim()) {
                  console.log('✅ QR code encontrado no arquivo:', code.data);
                  resolve(code.data);
                  return;
                }
              } catch (error) {
                continue;
              }
            }

            // Tentar com diferentes escalas se não encontrou
            for (const scale of [0.5, 1.5, 2.0]) {
              const scaledWidth = Math.floor(width * scale);
              const scaledHeight = Math.floor(height * scale);
              
              canvas.width = scaledWidth;
              canvas.height = scaledHeight;
              context.drawImage(img, 0, 0, scaledWidth, scaledHeight);
              
              const scaledImageData = context.getImageData(0, 0, scaledWidth, scaledHeight);
              
              for (const config of configurations) {
                try {
                  const code = jsQR(scaledImageData.data, scaledImageData.width, scaledImageData.height, config);
                  if (code && code.data && code.data.trim()) {
                    console.log('✅ QR code encontrado com escala:', scale, code.data);
                    resolve(code.data);
                    return;
                  }
                } catch (error) {
                  continue;
                }
              }
            }
            
            resolve(null);
          };
          img.onerror = () => reject(new Error('Erro ao carregar imagem'));
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(processedFile);
      });
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      throw error;
    }
  };

  const startCamera = async () => {
    try {
      cleanup();
      
      // Configurações otimizadas para dispositivos móveis (copiado da AutoCorrectionPage)
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

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          
          const handleLoadedData = () => {
            console.log('✅ Vídeo carregado, resolução:', video.videoWidth, 'x', video.videoHeight);
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
          description: correctionMode === 'qr' ? "Posicione o QR code da prova" : "Posicione a folha de resposta para correção instantânea",
        });
      }
    } catch (error) {
      console.error('❌ Erro ao iniciar câmera:', error);
      let errorMessage = "Não foi possível acessar a câmera.";
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = "Permissão negada. Permita o acesso à câmera e tente novamente.";
        } else if (error.name === 'NotFoundError') {
          errorMessage = "Nenhuma câmera encontrada no dispositivo.";
        } else if (error.name === 'NotSupportedError') {
          errorMessage = "Câmera não suportada neste navegador.";
        } else if (error.name === 'NotReadableError') {
          errorMessage = "Câmera está sendo usada por outro aplicativo.";
        }
      }
      
      toast({
        title: "❌ Erro na Câmera",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const startInstantCorrection = () => {
    if (correctionIntervalRef.current) return;
    correctionIntervalRef.current = setInterval(() => {
      if (videoRef.current?.readyState >= 2 && gabaritoData) processInstantCorrection();
    }, 200);
  };

  // Função para escaneamento automático contínuo ultra-rápido (copiado da AutoCorrectionPage)
  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    
    console.log('🚀 Iniciando escaneamento ultra-rápido...');
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        scanVideoForQR();
      }
    }, 50); // 20x por segundo para detecção instantânea
  };

  // Função otimizada para escanear vídeo em busca de QR code (copiado da AutoCorrectionPage)
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
    
    // Tentar múltiplas configurações para máxima compatibilidade (copiado da AutoCorrectionPage)
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
          playBeep(); // Som de confirmação
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

  // Som de beep melhorado (copiado da AutoCorrectionPage)
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

  // Função para gerar pontos de referência automaticamente do HTML do gabarito
  const generateReferencePointsFromHTML = (htmlContent: string, gabaritoData: GabaritoData) => {
    console.log('🎯 Gerando pontos de referência a partir do HTML do gabarito...');
    
    const referencePoints: any = {};
    
    // Extrair coordenadas dos bubbles do HTML
    const bubbleRegex = /<div[^>]*class="[^"]*bubble[^"]*"[^>]*data-question="(\d+)"[^>]*data-option="([A-E])"[^>]*style="[^"]*left:\s*(\d+(?:\.\d+)?)px[^"]*top:\s*(\d+(?:\.\d+)?)px[^"]*width:\s*(\d+(?:\.\d+)?)px[^"]*height:\s*(\d+(?:\.\d+)?)px[^"]*"[^>]*>/g;
    
    let match;
    while ((match = bubbleRegex.exec(htmlContent)) !== null) {
      const questionNum = parseInt(match[1]);
      const option = match[2];
      const x = parseFloat(match[3]);
      const y = parseFloat(match[4]);
      const w = parseFloat(match[5]);
      const h = parseFloat(match[6]);
      
      if (!referencePoints[`q${questionNum}`]) {
        referencePoints[`q${questionNum}`] = { bubbles: {} };
      }
      
      referencePoints[`q${questionNum}`].bubbles[option] = { x, y, w, h };
    }
    
    // Se não encontrou com o regex complexo, usar regex simples e calcular posições
    if (Object.keys(referencePoints).length === 0) {
      console.log('📐 Usando cálculo de posições baseado na estrutura padrão...');
      
      const simpleBubbleRegex = /<div[^>]*data-question="(\d+)"[^>]*data-option="([A-E])"[^>]*>/g;
      let baseX = 249, baseY = 227; // Posições base padrão
      
      while ((match = simpleBubbleRegex.exec(htmlContent)) !== null) {
        const questionNum = parseInt(match[1]);
        const option = match[2];
        
        if (!referencePoints[`q${questionNum}`]) {
          referencePoints[`q${questionNum}`] = { bubbles: {} };
        }
        
        // Calcular posição baseada na estrutura padrão
        const x = baseX + (option.charCodeAt(0) - 65) * 16; // A=0, B=16, C=32, etc
        const y = baseY + (questionNum - 1) * 19; // Cada linha tem ~19px
        
        referencePoints[`q${questionNum}`].bubbles[option] = {
          x, y, w: 13, h: 13
        };
      }
    }
    
    // Adicionar pontos de calibração nas extremidades para alinhamento
    const calibrationPoints = {
      top_left: { x: 50, y: 50, type: 'calibration' },
      top_right: { x: 750, y: 50, type: 'calibration' },
      bottom_left: { x: 50, y: 550, type: 'calibration' },
      bottom_right: { x: 750, y: 550, type: 'calibration' }
    };
    
    console.log(`✅ Gerados pontos de referência para ${Object.keys(referencePoints).length} questões`);
    console.log('🎯 Pontos de calibração adicionados para alinhamento preciso');
    
    return {
      bubbles: referencePoints,
      calibration: calibrationPoints,
      total_questions: Object.keys(referencePoints).length
    };
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
    
    // Usar pontos de referência gerados automaticamente
    const referencePoints = gabaritoData.coordinates || generateReferencePointsFromHTML(gabaritoData.html_content || '', gabaritoData);
    
    Object.entries(referencePoints.bubbles || gabaritoData.coordinates).forEach(([questionKey, questionData]: [string, any]) => {
      const questionNum = questionKey.replace('q', '');
      const bubbles = questionData.bubbles;
      
      let markedOption = null;
      let maxDarkness = 0;
      
      Object.entries(bubbles).forEach(([option, coords]: [string, any]) => {
        // Análise de pixel aprimorada com múltiplos pontos de amostra
        const darkness = analyzeCircleInImageDataAdvanced(imageData, coords.x, coords.y, coords.w / 2);
        if (darkness > maxDarkness && darkness > 0.25) { // Threshold mais sensível
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

  // Análise de círculo aprimorada com múltiplos pontos de amostra
  const analyzeCircleInImageDataAdvanced = (imageData: ImageData, x: number, y: number, radius: number): number => {
    const { data, width, height } = imageData;
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    
    let totalPixels = 0;
    let darkPixels = 0;
    
    // Análise em círculo com múltiplos pontos de amostra
    const samplePoints = 8; // Número de pontos de amostra por anel
    const rings = 3; // Número de anéis concêntricos
    
    for (let ring = 0; ring < rings; ring++) {
      const ringRadius = radius * (ring + 1) / rings;
      
      for (let point = 0; point < samplePoints; point++) {
        const angle = (point * 2 * Math.PI) / samplePoints;
        const sampleX = Math.floor(x + Math.cos(angle) * ringRadius);
        const sampleY = Math.floor(y + Math.sin(angle) * ringRadius);
        
        if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
          const index = (sampleY * width + sampleX) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          
          // Calcular brightness com peso para diferentes cores
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
          
          totalPixels++;
          if (brightness < 140) { // Threshold mais sensível para marcações leves
            darkPixels++;
          }
        }
      }
    }
    
    // Análise do centro também
    const centerIndex = (Math.floor(y) * width + Math.floor(x)) * 4;
    if (centerIndex >= 0 && centerIndex < data.length - 3) {
      const centerBrightness = (data[centerIndex] * 0.299 + data[centerIndex + 1] * 0.587 + data[centerIndex + 2] * 0.114);
      totalPixels++;
      if (centerBrightness < 140) {
        darkPixels++;
      }
    }
    
    return totalPixels > 0 ? darkPixels / totalPixels : 0;
  };

  const handleQRDetected = async (qrData: string) => {
    try {
      console.log('🔍 Processando QR code:', qrData);
      
      // Chamar a edge function para processar o gabarito com melhor tratamento de erros
      const { data, error } = await supabase.functions.invoke('qr-gabarito-reader', {
        body: { qrData }
      });

      if (error || !data) {
        console.error('❌ Erro ao processar QR:', error);
        toast({
          title: "❌ Erro ao processar QR code",
          description: error?.message || 'QR code inválido ou gabarito não encontrado',
          variant: "destructive"
        });
        setIsScanning(true);
        startAutoScan();
        return;
      }

      console.log('✅ Gabarito processado:', data);
      
      // Gerar pontos de referência automaticamente se temos o HTML
      if (data.html_content) {
        console.log('🎯 Gerando pontos de referência a partir do HTML...');
        const referencePoints = generateReferencePointsFromHTML(data.html_content, data);
        data.coordinates = referencePoints.bubbles;
        data.calibration_points = referencePoints.calibration;
      }
      
      setGabaritoData(data);
      setCorrectionMode('instant');
      
      // Parar escaneamento QR e iniciar correção instantânea
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      
      startInstantCorrection();
      
      toast({
        title: "✅ QR Code Lido!",
        description: `${data.exam.title} - ${data.student.name}`,
      });
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

  // Função para upload de arquivo e detecção de QR code
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsScanning(true);
      toast({
        title: "📂 Processando arquivo...",
        description: "Buscando QR code na imagem",
      });

      const qrCodeText = await readQRCodeFromFile(file);
      
      if (qrCodeText) {
        console.log('✅ QR code encontrado no arquivo!');
        await handleQRDetected(qrCodeText);
      } else {
        toast({
          title: "❌ QR Code não encontrado",
          description: "Não foi possível encontrar um QR code válido na imagem",
          variant: "destructive"
        });
        setIsScanning(false);
      }
    } catch (error) {
      console.error('❌ Erro ao processar arquivo:', error);
      toast({
        title: "❌ Erro",
        description: 'Erro ao processar arquivo',
        variant: "destructive"
      });
      setIsScanning(false);
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
      // Overlay da folha de resposta com pontos de referência
      const scaleX = canvas.width / 800;
      const scaleY = canvas.height / 600;

      // Desenhar pontos de calibração se disponíveis
      if (gabaritoData.calibration_points) {
        Object.entries(gabaritoData.calibration_points).forEach(([pointName, point]: [string, any]) => {
          const x = point.x * scaleX;
          const y = point.y * scaleY;
          
          // Desenhar ponto de calibração
          context.beginPath();
          context.arc(x, y, 8, 0, 2 * Math.PI);
          context.strokeStyle = '#00ff00';
          context.fillStyle = 'rgba(0, 255, 0, 0.3)';
          context.lineWidth = 3;
          context.fill();
          context.stroke();
          
          // Label do ponto
          context.fillStyle = 'white';
          context.font = 'bold 12px Arial';
          context.textAlign = 'center';
          context.fillText(pointName.replace('_', ' '), x, y - 15);
        });
      }

      // Desenhar bubbles com detecção
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
            context.fillStyle = instantResult.is_correct ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
            context.fill();
            context.lineWidth = 3;
          } else {
            context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            context.lineWidth = 2;
          }
          
          context.stroke();
          
          // Mostrar número da questão na primeira opção (A)
          if (option === 'A') {
            context.fillStyle = 'white';
            context.font = 'bold 14px Arial';
            context.textAlign = 'center';
            context.fillText(`Q${questionNum}`, x - 30, y + 5);
          }
        });
      });

      // Estatísticas em tempo real aprimoradas
      const resultCount = Object.keys(instantResults).length;
      const correctCount = Object.values(instantResults).filter(r => r.is_correct).length;
      const avgConfidence = resultCount > 0 ? 
        Object.values(instantResults).reduce((sum, r) => sum + (r.confidence || 0), 0) / resultCount : 0;
      
      // Background do painel de estatísticas
      const panelWidth = 350;
      const panelHeight = 120;
      context.fillStyle = 'rgba(0, 0, 0, 0.8)';
      context.fillRect(10, 10, panelWidth, panelHeight);
      
      // Borda do painel
      context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      context.lineWidth = 1;
      context.strokeRect(10, 10, panelWidth, panelHeight);
      
      context.fillStyle = 'white';
      context.font = 'bold 18px Arial';
      context.textAlign = 'left';
      context.fillText(`📊 Correção em Tempo Real`, 20, 35);
      
      context.font = '14px Arial';
      context.fillText(`Questões detectadas: ${resultCount}`, 20, 55);
      context.fillText(`Acertos: ${correctCount} | Erros: ${resultCount - correctCount}`, 20, 75);
      context.fillText(`Percentual: ${resultCount > 0 ? Math.round((correctCount / resultCount) * 100) : 0}%`, 20, 95);
      context.fillText(`Confiança média: ${Math.round(avgConfidence * 100)}%`, 20, 115);
      
      // Barra de progresso
      const progressWidth = 200;
      const progressHeight = 8;
      const progressX = panelWidth - progressWidth - 20;
      const progressY = 100;
      
      // Background da barra
      context.fillStyle = 'rgba(255, 255, 255, 0.2)';
      context.fillRect(progressX, progressY, progressWidth, progressHeight);
      
      // Progresso atual
      const progress = gabaritoData.total_questions > 0 ? resultCount / gabaritoData.total_questions : 0;
      context.fillStyle = '#22c55e';
      context.fillRect(progressX, progressY, progressWidth * progress, progressHeight);
      
      // Texto do progresso
      context.fillStyle = 'white';
      context.font = '12px Arial';
      context.textAlign = 'center';
      context.fillText(`${resultCount}/${gabaritoData.total_questions || 0}`, progressX + progressWidth / 2, progressY - 5);
    } else {
      // Guia para QR code
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

      // Bordas do QR animadas
      const cornerSize = 40;
      const time = Date.now() / 1000;
      const pulseOpacity = 0.5 + 0.3 * Math.sin(time * 3);
      
      context.strokeStyle = `rgba(0, 255, 0, ${pulseOpacity})`;
      context.lineWidth = 4;
      context.lineCap = 'round';

      // Desenhar cantos
      const corners = [
        [qrX, qrY, qrX + cornerSize, qrY, qrX, qrY + cornerSize],
        [qrX + qrSize - cornerSize, qrY, qrX + qrSize, qrY, qrX + qrSize, qrY + cornerSize],
        [qrX, qrY + qrSize - cornerSize, qrX, qrY + qrSize, qrX + cornerSize, qrY + qrSize],
        [qrX + qrSize - cornerSize, qrY + qrSize, qrX + qrSize, qrY + qrSize, qrX + qrSize, qrY + qrSize - cornerSize]
      ];

      corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.lineTo(x3, y3);
        context.stroke();
      });

      // Texto
      context.fillStyle = 'white';
      context.font = 'bold 18px Arial';
      context.textAlign = 'center';
      context.fillText('Posicione o QR code da prova aqui', canvas.width / 2, qrY - 20);
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
          
          {/* Opções de upload para QR code */}
          {correctionMode === 'qr' && (
            <div className="flex justify-center space-x-4">
              <input
                type="file"
                accept="image/*,.heic"
                onChange={handleFileUpload}
                className="hidden"
                ref={fileInputRef}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload QR Code
              </Button>
            </div>
          )}
          
          {correctionMode === 'instant' && gabaritoData && (
            <div className="flex justify-center space-x-4">
              <Button onClick={finalizarCorrecao} disabled={Object.keys(instantResults).length === 0}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Finalizar Correção ({Object.keys(instantResults).length}/{gabaritoData.total_questions})
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