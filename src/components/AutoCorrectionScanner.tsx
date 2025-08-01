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

interface CorrectionResult {
  score: number;
  maxScore: number;
  percentage: number;
  answers: Record<string, string>;
  studentName?: string;
  studentId?: string;
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
        studentId: ocrResult.studentId || manualStudentId
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
            <Label htmlFor="exam-image">Imagem da Prova</Label>
            <Input
              ref={fileInputRef}
              type="file"
              id="exam-image"
              accept="image/*"
              onChange={handleFileSelect}
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Selecione uma imagem clara da folha de respostas com QR code visível
            </p>
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