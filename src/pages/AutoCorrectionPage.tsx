import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Camera, Upload, CheckCircle, Loader2, Save, QrCode } from 'lucide-react';

interface QRCodeData {
  examId: string;
  studentId: string;
  version?: number;
}

interface CorrectionResult {
  examId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  percentage: number;
  correctAnswers: Record<string, string>;
  feedback: Array<{
    questionNumber: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export default function AutoCorrectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const startCamera = async () => {
    try {
      // Verificar se getUserMedia está disponível
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log('Tentando acessar a câmera...');
      
      // Configurações para desktop e mobile
      const constraints = {
        video: {
          // Usar câmera traseira no mobile, qualquer câmera no desktop
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Câmera acessada com sucesso');
      
      setCameraStream(stream);
      setUseCamera(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Garantir que o vídeo seja reproduzido
        videoRef.current.play().catch(err => {
          console.error('Erro ao reproduzir vídeo:', err);
        });
      }

      toast({
        title: "Sucesso!",
        description: "Câmera ativada com sucesso.",
      });

    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      
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
        title: "Erro de Câmera",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUseCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    if (context) {
      context.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFile(file);
          stopCamera();
          toast({
            title: "Foto capturada!",
            description: "Agora você pode processar a correção.",
          });
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setCorrectionResult(null);
    }
  };

  // Função para extrair dados do QR Code
  const extractQRCodeData = (qrCodeText: string): QRCodeData | null => {
    try {
      // Assumindo que o QR code contém JSON com examId e studentId
      const data = JSON.parse(qrCodeText);
      if (data.examId && data.studentId) {
        return data;
      }
      return null;
    } catch {
      // Se não for JSON, tentar extrair por padrão
      const match = qrCodeText.match(/examId=([^&]+)&studentId=([^&]+)/);
      if (match) {
        return {
          examId: match[1],
          studentId: match[2]
        };
      }
      return null;
    }
  };

  const processCorrection = async () => {
    if (!selectedFile || !user) {
      toast({
        title: "Erro",
        description: "Selecione uma imagem da prova para processar.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Simular OCR e extração de QR code
      // Em um ambiente real, você usaria uma biblioteca de OCR como Tesseract.js
      // e uma biblioteca de QR code como jsqr
      
      // Upload da imagem
      const fileName = `correction_${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('correction-scans')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Simular chamada para edge function de OCR
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-correction', {
        body: {
          fileName: fileName,
          examMode: 'qr_scan'
        }
      });

      if (ocrError) {
        throw new Error(`Erro na correção: ${ocrError.message}`);
      }

      // Extrair dados do QR code
      const qrData = extractQRCodeData(ocrResult.qrCodeText || '');
      if (!qrData) {
        throw new Error('QR Code não encontrado ou inválido na imagem');
      }

      // Buscar dados da prova
      const { data: examData, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', qrData.examId)
        .single();

      if (examError || !examData) {
        throw new Error('Prova não encontrada');
      }

      // Buscar gabarito específico do aluno
      const { data: studentExam, error: studentExamError } = await supabase
        .from('student_exams')
        .select('*')
        .eq('exam_id', qrData.examId)
        .eq('student_id', qrData.studentId)
        .single();

      if (studentExamError || !studentExam) {
        throw new Error('Gabarito do aluno não encontrado');
      }

      // Buscar dados do aluno
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('id', qrData.studentId)
        .single();

      // Simular respostas detectadas (em um caso real, viria do OCR)
      const detectedAnswers = ocrResult.detectedAnswers || {};
      
      // Comparar com gabarito
      const correctAnswers = studentExam.answer_key as Record<string, string>;
      let score = 0;
      const feedback = [];

      for (const [questionNum, studentAnswer] of Object.entries(detectedAnswers)) {
        const correctAnswer = correctAnswers[questionNum];
        const isCorrect = studentAnswer === correctAnswer;
        
        if (isCorrect) {
          score += 1; // Assumindo 1 ponto por questão
        }

        feedback.push({
          questionNumber: questionNum,
          studentAnswer: studentAnswer as string,
          correctAnswer: correctAnswer as string,
          isCorrect
        });
      }

      const maxScore = Object.keys(correctAnswers).length;
      const percentage = (score / maxScore) * 100;

      const result: CorrectionResult = {
        examId: qrData.examId,
        studentId: qrData.studentId,
        studentName: studentData?.name || 'Aluno não identificado',
        answers: detectedAnswers,
        score,
        maxScore,
        percentage,
        correctAnswers,
        feedback
      };

      setCorrectionResult(result);
      
      toast({
        title: "Correção realizada!",
        description: `Prova corrigida: ${score}/${maxScore} (${percentage.toFixed(1)}%)`,
      });

    } catch (error) {
      console.error('Erro no processamento:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : 'Erro desconhecido no processamento',
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveCorrection = async () => {
    if (!correctionResult || !user) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('exam_corrections')
        .insert({
          exam_id: correctionResult.examId,
          student_id: correctionResult.studentId,
          student_name: correctionResult.studentName,
          answers: correctionResult.answers,
          score: correctionResult.score,
          max_score: correctionResult.maxScore,
          percentage: correctionResult.percentage,
          auto_corrected: true,
          author_id: user.id,
          image_url: selectedFile ? `correction_${Date.now()}_${selectedFile.name}` : null
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Sucesso!",
        description: "Correção salva no banco de dados.",
      });

      // Limpar estado
      setCorrectionResult(null);
      setSelectedFile(null);
      
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a correção.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Correção Automática</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Card de captura */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Correção Automática de Provas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center space-y-4">
                {!useCamera ? (
                  <div className="space-y-4">
                    <Button onClick={startCamera} className="w-full">
                      <Camera className="w-4 h-4 mr-2" />
                      Usar Câmera
                    </Button>
                    
                    <div className="text-center text-muted-foreground">ou</div>
                    
                    <div>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Enviar Arquivo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      className="w-full max-w-md mx-auto rounded-lg border bg-black"
                      style={{ aspectRatio: '16/9' }}
                    />
                    <div className="flex gap-2 justify-center">
                      <Button onClick={capturePhoto}>
                        <Camera className="w-4 h-4 mr-2" />
                        Capturar
                      </Button>
                      <Button variant="outline" onClick={stopCamera}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {selectedFile && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <p className="text-sm font-medium">Arquivo selecionado:</p>
                  <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
                </div>
              )}

              <div className="text-sm text-muted-foreground text-center space-y-1">
                <p>📱 Escaneie o QR code da prova para correção automática</p>
                <p>✅ O sistema identificará o aluno e aplicará o gabarito correto</p>
                <p>⚡ Correção em tempo real com resultados instantâneos</p>
              </div>

              <Button
                onClick={processCorrection}
                disabled={!selectedFile || isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
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

          {/* Resultado da correção */}
          {correctionResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Resultado da Correção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Informações do aluno */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h4 className="font-semibold mb-2">Informações do Aluno</h4>
                  <p><strong>Nome:</strong> {correctionResult.studentName}</p>
                  <p><strong>ID:</strong> {correctionResult.studentId}</p>
                </div>

                {/* Pontuação */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-6 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Pontuação</p>
                    <p className="text-3xl font-bold text-green-600">{correctionResult.score}</p>
                    <p className="text-sm">de {correctionResult.maxScore}</p>
                  </div>
                  <div className="text-center p-6 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Percentual</p>
                    <p className="text-3xl font-bold text-blue-600">{correctionResult.percentage.toFixed(1)}%</p>
                  </div>
                  <div className="text-center p-6 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Acertos</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {correctionResult.feedback.filter(f => f.isCorrect).length}
                    </p>
                    <p className="text-sm">de {correctionResult.feedback.length}</p>
                  </div>
                </div>

                {/* Feedback detalhado */}
                <div>
                  <h4 className="font-semibold mb-3">Respostas Detalhadas</h4>
                  <div className="grid gap-2">
                    {correctionResult.feedback.map((item) => (
                      <div 
                        key={item.questionNumber}
                        className={`p-3 rounded-lg border ${
                          item.isCorrect 
                            ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                            : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Questão {item.questionNumber}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.isCorrect 
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          }`}>
                            {item.isCorrect ? 'Correto' : 'Incorreto'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm">
                          <span>Resposta: <strong>{item.studentAnswer}</strong></span>
                          {!item.isCorrect && (
                            <span className="ml-4">Gabarito: <strong>{item.correctAnswer}</strong></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Botão para salvar */}
                <Button 
                  onClick={saveCorrection}
                  disabled={isSaving}
                  className="w-full"
                  size="lg"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Correção
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}