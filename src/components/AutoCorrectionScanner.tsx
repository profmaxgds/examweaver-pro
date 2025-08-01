import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Camera, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

interface CorrectionResult {
  score: number;
  maxScore: number;
  percentage: number;
  answers: Record<string, string>;
  studentName?: string;
  studentId?: string;
  processedImageUrl?: string;
}

export function AutoCorrectionScanner() {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualStudentName, setManualStudentName] = useState('');
  const [manualStudentId, setManualStudentId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setCorrectionResult(null);
    }
  };

  const takePictureWithCamera = async () => {
    try {
      console.log('🎥 === INICIANDO CAPTURA DE FOTO ===');
      console.log('📱 Plataforma nativa?', Capacitor.isNativePlatform());
      console.log('🌐 User Agent:', navigator.userAgent);
      console.log('🔒 Protocolo:', window.location.protocol);
      console.log('🌍 URL atual:', window.location.href);
      
      // SEMPRE usar câmera web para browsers móveis
      console.log('🌐 Forçando uso da câmera web...');
      
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

      // Solicitar permissões primeiro
      console.log('🔐 Solicitando permissões de câmera...');
      
      try {
        // Tentar configuração simples primeiro
        console.log('🔄 Tentativa 1: Configuração básica');
        let stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        
        console.log('✅ Stream obtido com sucesso!');
        console.log('📊 Configurações do stream:', stream.getVideoTracks()[0]?.getSettings());
        
        await processStreamToFile(stream);
        
      } catch (firstError) {
        console.warn('⚠️ Primeira tentativa falhou:', firstError);
        
        try {
          console.log('🔄 Tentativa 2: Câmera frontal');
          let stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
          
          console.log('✅ Stream obtido (câmera frontal)!');
          await processStreamToFile(stream);
          
        } catch (secondError) {
          console.warn('⚠️ Segunda tentativa falhou:', secondError);
          
          try {
            console.log('🔄 Tentativa 3: Qualquer câmera');
            let stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false
            });
            
            console.log('✅ Stream obtido (qualquer câmera)!');
            await processStreamToFile(stream);
            
          } catch (thirdError) {
            console.error('❌ Todas as tentativas falharam:', thirdError);
            
            if (thirdError.name === 'NotAllowedError') {
              toast.error('Permissão negada! Permita o acesso à câmera e tente novamente.');
            } else if (thirdError.name === 'NotFoundError') {
              toast.error('Nenhuma câmera encontrada no dispositivo.');
            } else if (thirdError.name === 'NotSupportedError') {
              toast.error('Câmera não suportada. Tente acessar via HTTPS.');
            } else {
              toast.error(`Erro: ${thirdError.message}`);
            }
            return;
          }
        }
      }
      
    } catch (error) {
      console.error('💥 Erro geral:', error);
      toast.error('Erro inesperado ao acessar câmera');
    }
  };

  const processStreamToFile = async (stream: MediaStream) => {
    return new Promise<void>((resolve, reject) => {
      try {
        console.log('📹 Processando stream para arquivo...');
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true; // Crucial para iOS
        
        // Adicionar temporariamente ao DOM (necessário para alguns browsers)
        video.style.position = 'absolute';
        video.style.top = '-9999px';
        video.style.left = '-9999px';
        video.style.width = '1px';
        video.style.height = '1px';
        document.body.appendChild(video);
        
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout - vídeo não carregou'));
        }, 10000);
        
        const cleanup = () => {
          clearTimeout(timeoutId);
          if (document.body.contains(video)) {
            document.body.removeChild(video);
          }
          stream.getTracks().forEach(track => {
            console.log('⏹️ Parando track:', track.kind, track.label);
            track.stop();
          });
        };
        
        video.addEventListener('loadedmetadata', () => {
          console.log('📐 Metadados carregados:', {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration
          });
          
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            cleanup();
            reject(new Error('Dimensões inválidas do vídeo'));
            return;
          }
          
          // Aguardar um frame estar disponível
          setTimeout(() => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                cleanup();
                reject(new Error('Não foi possível criar contexto do canvas'));
                return;
              }
              
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              
              console.log('🎨 Capturando frame...');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob((blob) => {
                cleanup();
                
                if (!blob) {
                  reject(new Error('Erro ao gerar blob da imagem'));
                  return;
                }
                
                const file = new File([blob], `camera_${Date.now()}.jpg`, { 
                  type: 'image/jpeg' 
                });
                
                console.log('✅ Arquivo criado:', {
                  name: file.name,
                  size: `${(file.size / 1024).toFixed(2)} KB`,
                  type: file.type
                });
                
                setSelectedFile(file);
                setCorrectionResult(null);
                toast.success('📸 Foto capturada com sucesso!');
                resolve();
                
              }, 'image/jpeg', 0.9);
              
            } catch (captureError) {
              cleanup();
              reject(captureError);
            }
          }, 1000); // Aguardar 1 segundo para garantir frame válido
        });
        
        video.addEventListener('error', (err) => {
          console.error('❌ Erro no vídeo:', err);
          cleanup();
          reject(new Error('Erro ao carregar vídeo'));
        });
        
      } catch (processError) {
        console.error('❌ Erro no processamento:', processError);
        stream.getTracks().forEach(track => track.stop());
        reject(processError);
      }
    });
  };

  const selectFromGallery = async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        // No navegador, usar input file
        fileInputRef.current?.click();
        return;
      }

      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      if (image.dataUrl) {
        // Converter dataURL para File
        const response = await fetch(image.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `gallery_image_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        setSelectedFile(file);
        setCorrectionResult(null);
        toast.success('Imagem selecionada da galeria!');
      }
    } catch (error) {
      console.error('Erro ao selecionar da galeria:', error);
      toast.error('Erro ao acessar a galeria.');
    }
  };

  const processCorrection = async () => {
    if (!selectedFile || !user) {
      toast.error('Selecione uma imagem da prova para processar');
      return;
    }

    setIsProcessing(true);

    try {
      // Converter arquivo para base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove o prefixo data:image/...;base64,
        };
        reader.readAsDataURL(selectedFile);
      });

      // Fazer upload da imagem para o storage
      const fileName = `correction_${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('correction-scans')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Obter URL pública da imagem
      const { data: { publicUrl } } = supabase.storage
        .from('correction-scans')
        .getPublicUrl(fileName);

      // Chamar a edge function de OCR
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-correction', {
        body: {
          imageData: `data:image/${selectedFile.type.split('/')[1]};base64,${base64}`,
          examId: null // Será extraído do QR code na imagem
        }
      });

      if (ocrError) {
        throw new Error(`Erro na correção OCR: ${ocrError.message}`);
      }

      const result: CorrectionResult = {
        score: ocrResult.score || 0,
        maxScore: ocrResult.maxScore || 0,
        percentage: ocrResult.percentage || 0,
        answers: ocrResult.answers || {},
        studentName: ocrResult.studentName || manualStudentName,
        studentId: ocrResult.studentId || manualStudentId,
        processedImageUrl: publicUrl
      };

      // Salvar correção no banco
      const { error: saveError } = await supabase
        .from('exam_corrections')
        .insert({
          exam_id: ocrResult.examId,
          student_name: result.studentName || 'Não identificado',
          student_identification: result.studentId,
          answers: result.answers,
          score: result.score,
          max_score: result.maxScore,
          percentage: result.percentage,
          qr_code_data: ocrResult.qrCodeData,
          image_url: publicUrl,
          auto_corrected: true,
          author_id: user.id
        });

      if (saveError) {
        console.error('Erro ao salvar correção:', saveError);
        toast.error('Correção processada, mas erro ao salvar no banco de dados');
      } else {
        toast.success('Correção processada e salva com sucesso!');
      }

      setCorrectionResult(result);
    } catch (error) {
      console.error('Erro no processamento:', error);
      toast.error(error instanceof Error ? error.message : 'Erro desconhecido no processamento');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Correção Automática de Provas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Capturar Imagem da Prova</Label>
            <div className="mt-2 space-y-3">
              {/* Botões para dispositivos móveis */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={takePictureWithCamera}
                  className="flex items-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Tirar Foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectFromGallery}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Galeria
                </Button>
              </div>
              
              {/* Input file oculto para navegadores */}
              <Input
                ref={fileInputRef}
                type="file"
                id="exam-image"
                accept="image/*"
                onChange={handleFileSelect}
                className="mt-1"
                style={{ display: Capacitor.isNativePlatform() ? 'none' : 'block' }}
              />
               
               <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                 <p className="font-medium text-blue-800 mb-1">📱 Para usar a câmera no seu dispositivo:</p>
                 <ul className="text-blue-700 space-y-1 ml-4">
                   <li>• Clique em "Tirar Foto" e permita o acesso à câmera quando solicitado</li>
                   <li>• No Safari/iOS: Toque no ícone "Aa" na barra de endereço {'>'}  Configurações do Site {'>'}  Câmera: Permitir</li>
                   <li>• No Chrome/Android: Toque no ícone de cadeado/câmera na barra de endereço {'>'}  Permitir câmera</li>
                   <li>• Certifique-se de que está usando HTTPS (URL deve começar com https://)</li>
                 </ul>
               </div>
               
               <p className="text-sm text-muted-foreground">
                 {Capacitor.isNativePlatform() 
                   ? 'Use os botões acima para capturar ou selecionar uma imagem da folha de respostas'
                   : 'Use "Tirar Foto" para acessar a câmera ou "Galeria" para selecionar uma imagem existente'
                 }
               </p>
            </div>
          </div>

          {selectedFile && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <p className="text-sm font-medium">Arquivo selecionado:</p>
              <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="student-name">Nome do Aluno (opcional)</Label>
              <Input
                id="student-name"
                value={manualStudentName}
                onChange={(e) => setManualStudentName(e.target.value)}
                placeholder="Digite o nome se não for detectado automaticamente"
              />
            </div>
            <div>
              <Label htmlFor="student-id">ID/Matrícula do Aluno (opcional)</Label>
              <Input
                id="student-id"
                value={manualStudentId}
                onChange={(e) => setManualStudentId(e.target.value)}
                placeholder="Digite a matrícula se não for detectada"
              />
            </div>
          </div>

          <Button
            onClick={processCorrection}
            disabled={!selectedFile || isProcessing}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando Correção...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Processar Correção
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {correctionResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Resultado da Correção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {correctionResult.processedImageUrl && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-3">Imagem Processada</h4>
                <div className="flex justify-center">
                  <img 
                    src={correctionResult.processedImageUrl} 
                    alt="Imagem utilizada para detecção das marcações"
                    className="max-w-full max-h-96 rounded-lg border"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Imagem utilizada para detecção das marcações
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Pontuação</p>
                <p className="text-2xl font-bold">{correctionResult.score.toFixed(2)}</p>
                <p className="text-sm">de {correctionResult.maxScore.toFixed(2)}</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Percentual</p>
                <p className="text-2xl font-bold">{correctionResult.percentage.toFixed(1)}%</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Questões</p>
                <p className="text-2xl font-bold">{Object.keys(correctionResult.answers).length}</p>
                <p className="text-sm">respondidas</p>
              </div>
            </div>

            {(correctionResult.studentName || correctionResult.studentId) && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2">Informações do Aluno</h4>
                {correctionResult.studentName && (
                  <p className="text-sm">Nome: {correctionResult.studentName}</p>
                )}
                {correctionResult.studentId && (
                  <p className="text-sm">ID/Matrícula: {correctionResult.studentId}</p>
                )}
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2">Marcações Detectadas na Folha de Respostas</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Análise automática das marcações circulares detectadas na imagem
              </p>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(correctionResult.answers).map(([questionNum, answer]) => (
                  <div key={questionNum} className="text-center p-2 bg-muted rounded border">
                    <p className="text-xs text-muted-foreground">Q{questionNum}</p>
                    <p className="font-bold text-primary">{answer}</p>
                  </div>
                ))}
              </div>
              {Object.keys(correctionResult.answers).length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                  <p>Nenhuma marcação foi detectada na imagem</p>
                  <p className="text-xs">Verifique se a imagem está clara e as marcações visíveis</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}