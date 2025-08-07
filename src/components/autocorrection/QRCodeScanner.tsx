import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { QrCode, ScanLine } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsQR from 'jsqr';
import heic2any from 'heic2any';

interface QRCodeScannerProps {
  onQRDetected: (examInfo: any) => void;
  startCamera: (mode: 'qr') => void;
  stopCamera: () => void;
  isScanning: boolean;
  setIsScanning: (value: boolean) => void;
  cameraStream: MediaStream | null; // Adicionada prop cameraStream
}

export function QRCodeScanner({ onQRDetected, startCamera, stopCamera, isScanning, setIsScanning, cameraStream }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Função para converter arquivos HEIC
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
      try {
        toast({ title: "Convertendo arquivo HEIC...", description: "Processando imagem do iPhone/iPad" });
        const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 }) as Blob;
        return new File([convertedBlob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
      } catch (error) {
        console.error('Erro ao converter HEIC:', error);
        throw new Error('Erro ao converter arquivo HEIC. Tente um formato diferente.');
      }
    }
    return file;
  };

  // Função robusta para ler QR code de arquivo
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

            const configurations = [
              { inversionAttempts: "dontInvert" as const },
              { inversionAttempts: "onlyInvert" as const },
              { inversionAttempts: "attemptBoth" as const },
              { inversionAttempts: "invertFirst" as const },
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

  // Função para tocar som de bip
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

  // Função para escanear QR code a partir do vídeo
  const scanVideoForQR = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    const scanWidth = 320;
    const scanHeight = 240;
    canvas.width = scanWidth;
    canvas.height = scanHeight;
    context.drawImage(video, 0, 0, scanWidth, scanHeight);
    const imageData = context.getImageData(0, 0, scanWidth, scanHeight);

    const configurations = [
      { inversionAttempts: "dontInvert" as const },
      { inversionAttempts: "onlyInvert" as const },
      { inversionAttempts: "attemptBoth" as const },
      { inversionAttempts: "invertFirst" as const },
    ];

    for (const config of configurations) {
      try {
        const code = jsQR(imageData.data, imageData.width, imageData.height, config);
        if (code && code.data && code.data.trim()) {
          console.log('✅ QR code detectado:', code.data);
          playBeep();
          setIsScanning(false);
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
          try {
            const parsedData = JSON.parse(code.data);
            onQRDetected(parsedData);
            stopCamera();
          } catch (error) {
            toast({ title: "Erro", description: "QR code inválido.", variant: "destructive" });
          }
          return;
        }
      } catch (error) {
        console.log('Erro ao escanear QR:', error);
      }
    }
  };

  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        scanVideoForQR();
      }
    }, 100);
  };

  useEffect(() => {
    if (isScanning && videoRef.current && cameraStream) {
      startCamera('qr');
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().then(() => {
        startAutoScan();
      }).catch((error) => {
        console.error('Erro ao reproduzir vídeo:', error);
        toast({ title: "Erro", description: "Não foi possível reproduzir o vídeo da câmera.", variant: "destructive" });
      });
    }
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      stopCamera();
    };
  }, [isScanning, cameraStream, startCamera, stopCamera]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const qrData = await readQRCodeFromFile(file);
      if (qrData) {
        const parsedData = JSON.parse(qrData);
        onQRDetected(parsedData);
        toast({ title: "QR Detectado!", description: "QR code lido com sucesso do arquivo." });
      } else {
        toast({ title: "Erro", description: "Nenhum QR code encontrado no arquivo.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao processar o arquivo.", variant: "destructive" });
    }
  };

  return (
    <Card className="border bg-card text-card-foreground hover:bg-accent/50 transition-colors cursor-pointer">
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <QrCode className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-semibold text-lg">Escanear QR Code</h3>
        <p className="text-sm text-muted-foreground">Detectar QR da prova com câmera ou arquivo</p>
        <p className="text-xs text-muted-foreground mt-1">📱 Otimizado para celular</p>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        {isScanning && (
          <div>
            <div className="relative w-full max-w-sm mx-auto">
              <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border bg-black" style={{ aspectRatio: '4/3' }} />
              <canvas ref={canvasRef} className="hidden" />
              <p className="absolute bottom-2 left-0 right-0 text-xs text-green-600 text-center bg-black/50 text-white py-1">
                Posicione o QR code
              </p>
            </div>
            <div className="mt-4">
              <div className="inline-flex items-center space-x-2 bg-muted text-muted-foreground px-4 py-2 rounded-lg">
                <ScanLine className="w-4 h-4 animate-pulse" />
                <span className="text-sm">Procurando QR code...</span>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-center space-x-4">
          <Button
            variant="outline"
            className="w-full max-w-xs"
            onClick={() => setIsScanning(true)}
            disabled={isScanning}
          >
            Iniciar Escaneamento
          </Button>
          <Button
            variant="outline"
            className="w-full max-w-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            Enviar Arquivo
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          onChange={handleFileUpload}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}