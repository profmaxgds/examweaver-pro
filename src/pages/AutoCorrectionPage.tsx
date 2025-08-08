import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LayoutExtractor } from '@/components/autocorrection/LayoutExtractor';
import { LiveCorrector } from '@/components/autocorrection/LiveCorrector';
import { AnswerEditor } from '@/components/autocorrection/AnswerEditor';
import { QRCodeScanner } from '@/components/autocorrection/QRCodeScanner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Camera, QrCode, Upload, FileImage, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';

interface QRCodeData {
  examId: string;
  studentId: string;
  studentName?: string;
  version?: number;
  studentExamId?: string;
}

interface ExamInfo {
  examId: string;
  studentId: string;
  examTitle: string;
  studentName: string;
  answerKey: Record<string, string>;
  version?: number;
  htmlContent?: string;
}

interface LayoutData {
  pageDimensions: any;
  bubbleDimensions: any;
  fieldBlocks: Record<string, any>;
  anchors: any[];
}

interface CorrectionResults {
  [questionId: string]: {
    correctAnswer: string;
    detectedAnswer: string;
    status: 'CORRETA' | 'ERRADA' | 'ANULADA';
    confidence: number;
  };
}

export default function AutoCorrectionPage() {
  const { user } = useAuth();
  
  // Estados principais do fluxo
  const [step, setStep] = useState<'qr-scan' | 'qr-detected' | 'layout-extract' | 'correction' | 'edit'>('qr-scan');
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [layoutData, setLayoutData] = useState<LayoutData | null>(null);
  const [correctionResults, setCorrectionResults] = useState<CorrectionResults | null>(null);
  const [screenshots, setScreenshots] = useState<{ feedback: string; original: string } | null>(null);
  
  // Estados da câmera e QR
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Iniciar câmera
  const startCamera = async (mode: 'qr') => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API não suportada neste navegador');
      }

      console.log('📷 Acessando câmera para QR scan...');
      
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setIsScanning(true);
      
      toast.success('📷 Câmera ativa! Posicione o QR code da prova');

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
      
      toast.error(errorMessage);
      setIsScanning(false);
    }
  };

  // Parar câmera
  const stopCamera = () => {
    setIsScanning(false);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  // Processar dados do QR code
  const processQRCodeData = async (qrData: string) => {
    setIsScanning(false);

    try {
      console.log('🔍 Processando dados do QR:', qrData);
      
      const qrInfo: QRCodeData = JSON.parse(qrData);
      
      // Buscar dados do exame
      const { data: exam } = await supabase
        .from('exams')
        .select('*')
        .eq('id', qrInfo.examId)
        .single();

      if (!exam) {
        throw new Error('Exame não encontrado');
      }

      // Buscar HTML do gabarito
      const { data: studentExam } = await supabase
        .from('student_exams')
        .select('*')
        .eq('exam_id', qrInfo.examId)
        .eq('student_id', qrInfo.studentId)
        .single();

      if (!studentExam?.html_content) {
        throw new Error('HTML do gabarito não encontrado');
      }

      // Processar answer_key do Supabase (Json -> Record<string, string>)
      let processedAnswerKey: Record<string, string> = {};
      const answerKey = studentExam.answer_key;
      if (answerKey && typeof answerKey === 'object' && !Array.isArray(answerKey)) {
        Object.entries(answerKey).forEach(([key, value]) => {
          if (typeof value === 'string') {
            processedAnswerKey[key] = value;
          }
        });
      }

      const examInfo: ExamInfo = {
        examId: qrInfo.examId,
        studentId: qrInfo.studentId,
        examTitle: exam.title,
        studentName: qrInfo.studentName || 'Estudante',
        answerKey: processedAnswerKey,
        version: qrInfo.version,
        htmlContent: studentExam.html_content
      };

      setExamInfo(examInfo);
      stopCamera();
      setStep('qr-detected');
      
      toast.success(`✅ QR Code detectado! Exame: ${exam.title}`);

    } catch (error) {
      console.error('Erro ao processar QR:', error);
      toast.error('Erro ao processar QR code. Verifique se é um QR válido.');
      setIsScanning(true);
    }
  };

  // Callback do QRCodeScanner
  const handleQRDetected = async (examData: any) => {
    await processQRCodeData(JSON.stringify(examData));
  };

  // Iniciar extração de layout
  const startLayoutExtraction = () => {
    if (!examInfo?.htmlContent) return;
    setStep('layout-extract');
  };

  // Callback da extração de layout
  const handleLayoutExtracted = (layout: LayoutData) => {
    setLayoutData(layout);
    setStep('correction');
    toast.success('Layout extraído! Iniciando correção automática...');
  };

  // Callback da correção completa
  const handleCorrectionComplete = (results: CorrectionResults, screenshots: { feedback: string; original: string }) => {
    setCorrectionResults(results);
    setScreenshots(screenshots);
    setStep('edit');
    toast.success('Correção concluída!');
  };

  // Salvar correção final
  const handleSaveCorrection = async (finalResults: CorrectionResults) => {
    if (!examInfo) return;

    try {
      const score = Object.values(finalResults).filter(r => r.status === 'CORRETA').length;
      const maxScore = Object.keys(finalResults).length;
      const percentage = (score / maxScore) * 100;

      const correctionData = {
        exam_id: examInfo.examId,
        student_id: examInfo.studentId,
        student_name: examInfo.studentName,
        answers: finalResults,
        score,
        max_score: maxScore,
        percentage,
        auto_corrected: true,
        confidence_score: Object.values(finalResults).reduce((acc, r) => acc + r.confidence, 0) / Object.keys(finalResults).length,
        author_id: user?.id
      };

      await supabase.from('exam_corrections').insert(correctionData);
      
      toast.success('Correção salva com sucesso!');
      handleReset();
    } catch (error) {
      toast.error('Erro ao salvar correção');
    }
  };

  // Reset do sistema
  const handleReset = () => {
    setStep('qr-scan');
    setExamInfo(null);
    setLayoutData(null);
    setCorrectionResults(null);
    setScreenshots(null);
    stopCamera();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {step !== 'qr-scan' && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-3xl font-bold">Auto Correção Inteligente</h1>
        </div>
        
        {/* Indicador de progresso */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'qr-scan' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <QrCode className="w-4 h-4" />
            QR Code
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'qr-detected' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <CheckCircle className="w-4 h-4" />
            Detectado
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'layout-extract' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <FileImage className="w-4 h-4" />
            Layout
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            step === 'correction' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            <Camera className="w-4 h-4" />
            Correção
          </div>
        </div>
      </div>

      {/* Etapa 1: Scan de QR Code */}
      {step === 'qr-scan' && (
        <div className="max-w-2xl mx-auto">
          <QRCodeScanner
            onQRDetected={handleQRDetected}
            startCamera={startCamera}
            stopCamera={stopCamera}
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            cameraStream={cameraStream}
          />
        </div>
      )}

      {/* Etapa 2: QR Detectado */}
      {step === 'qr-detected' && examInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              QR Code Detectado com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Exame</h4>
                <p className="font-semibold">{examInfo.examTitle}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Estudante</h4>
                <p className="font-semibold">{examInfo.studentName}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">ID do Exame</h4>
                <p className="text-sm font-mono">{examInfo.examId}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Versão</h4>
                <p className="text-sm">{examInfo.version || 1}</p>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <Button onClick={startLayoutExtraction} className="flex items-center gap-2">
                <FileImage className="w-4 h-4" />
                Continuar para Correção
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa 3: Extração de Layout */}
      {step === 'layout-extract' && examInfo?.htmlContent && (
        <LayoutExtractor 
          htmlContent={examInfo.htmlContent} 
          onLayoutExtracted={handleLayoutExtracted}
        />
      )}

      {/* Etapa 4: Correção ao Vivo */}
      {step === 'correction' && layoutData && examInfo && (
        <LiveCorrector
          layoutData={layoutData}
          correctAnswers={examInfo.answerKey}
          onCorrectionComplete={handleCorrectionComplete}
        />
      )}

      {/* Etapa 5: Editar Respostas */}
      {step === 'edit' && correctionResults && screenshots && (
        <AnswerEditor
          results={correctionResults}
          screenshots={screenshots}
          availableOptions={['A', 'B', 'C', 'D', 'E']}
          onSave={handleSaveCorrection}
          onCancel={handleReset}
        />
      )}
    </div>
  );
}