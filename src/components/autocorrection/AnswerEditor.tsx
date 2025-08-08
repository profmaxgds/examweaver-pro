import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, AlertCircle, Edit, Save, Download } from 'lucide-react';
import { toast } from 'sonner';

interface CorrectionResult {
  correctAnswer: string;
  detectedAnswer: string;
  status: 'CORRETA' | 'ERRADA' | 'ANULADA';
  confidence: number;
}

interface CorrectionResults {
  [questionId: string]: CorrectionResult;
}

interface AnswerEditorProps {
  results: CorrectionResults;
  screenshots: { feedback: string; original: string };
  availableOptions: string[]; // A, B, C, D, E, etc.
  onSave: (editedResults: CorrectionResults) => void;
  onCancel: () => void;
}

export const AnswerEditor = ({ 
  results, 
  screenshots, 
  availableOptions = ['A', 'B', 'C', 'D', 'E'],
  onSave, 
  onCancel 
}: AnswerEditorProps) => {
  const [editedResults, setEditedResults] = useState<CorrectionResults>(results);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Atualizar status quando a resposta detectada muda
  const updateQuestionStatus = (questionId: string, newDetectedAnswer: string) => {
    const correctAnswer = results[questionId].correctAnswer;
    let newStatus: 'CORRETA' | 'ERRADA' | 'ANULADA';

    if (newDetectedAnswer.length === 0) {
      newStatus = 'ERRADA';
    } else if (newDetectedAnswer.length > 1) {
      newStatus = 'ANULADA';
    } else if (newDetectedAnswer === correctAnswer) {
      newStatus = 'CORRETA';
    } else {
      newStatus = 'ERRADA';
    }

    setEditedResults(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        detectedAnswer: newDetectedAnswer,
        status: newStatus
      }
    }));
    setHasChanges(true);
  };

  // Alternar edição de uma questão
  const toggleEdit = (questionId: string) => {
    setEditingQuestion(editingQuestion === questionId ? null : questionId);
  };

  // Adicionar/remover opção da resposta detectada
  const toggleOption = (questionId: string, option: string) => {
    const currentAnswer = editedResults[questionId].detectedAnswer;
    let newAnswer: string;

    if (currentAnswer.includes(option)) {
      // Remover opção
      newAnswer = currentAnswer.replace(option, '');
    } else {
      // Adicionar opção (ordenar alfabeticamente)
      newAnswer = (currentAnswer + option).split('').sort().join('');
    }

    updateQuestionStatus(questionId, newAnswer);
  };

  // Limpar resposta
  const clearAnswer = (questionId: string) => {
    updateQuestionStatus(questionId, '');
  };

  // Definir como correta automaticamente
  const setAsCorrect = (questionId: string) => {
    const correctAnswer = results[questionId].correctAnswer;
    updateQuestionStatus(questionId, correctAnswer);
  };

  // Definir como anulada
  const setAsNullified = (questionId: string) => {
    // Marcar todas as opções para anular
    updateQuestionStatus(questionId, availableOptions.join(''));
  };

  // Calcular estatísticas
  const stats = Object.values(editedResults).reduce(
    (acc, result) => {
      acc[result.status.toLowerCase()]++;
      return acc;
    },
    { correta: 0, errada: 0, anulada: 0 }
  );

  // Obter cor do status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CORRETA': return 'text-green-600 bg-green-50';
      case 'ERRADA': return 'text-red-600 bg-red-50';
      case 'ANULADA': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Obter ícone do status
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CORRETA': return <CheckCircle className="w-4 h-4" />;
      case 'ERRADA': return <XCircle className="w-4 h-4" />;
      case 'ANULADA': return <AlertCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  // Salvar resultados
  const handleSave = () => {
    onSave(editedResults);
    toast.success('Correção salva com sucesso!');
  };

  // Exportar para CSV
  const exportToCsv = () => {
    const headers = ['Questão', 'Gabarito', 'Detectado', 'Status', 'Confiança'];
    const rows = Object.entries(editedResults).map(([questionId, result]) => [
      questionId,
      result.correctAnswer,
      result.detectedAnswer || '(vazio)',
      result.status,
      `${Math.round(result.confidence * 100)}%`
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `correcao_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho com estatísticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Editor de Respostas</span>
            <div className="flex gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                {stats.correta} Corretas
              </Badge>
              <Badge variant="secondary" className="bg-red-100 text-red-800">
                <XCircle className="w-3 h-3 mr-1" />
                {stats.errada} Erradas
              </Badge>
              <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                <AlertCircle className="w-3 h-3 mr-1" />
                {stats.anulada} Anuladas
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-medium mb-2">Resultado da Correção</h4>
              <img 
                src={screenshots.feedback} 
                alt="Feedback visual"
                className="w-full border rounded max-h-64 object-contain"
              />
            </div>
            <div>
              <h4 className="font-medium mb-2">Área Capturada</h4>
              <img 
                src={screenshots.original} 
                alt="Captura original"
                className="w-full border rounded max-h-64 object-contain"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button onClick={exportToCsv} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salvar Correção
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de questões para edição */}
      <div className="grid gap-4">
        {Object.entries(editedResults).map(([questionId, result]) => (
          <Card key={questionId}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-lg">{questionId}</span>
                  <Badge className={getStatusColor(result.status)}>
                    {getStatusIcon(result.status)}
                    {result.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Confiança: {Math.round(result.confidence * 100)}%
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleEdit(questionId)}
                >
                  <Edit className="w-4 h-4" />
                  {editingQuestion === questionId ? 'Fechar' : 'Editar'}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Gabarito:</Label>
                  <div className="font-mono bg-muted p-2 rounded">
                    {result.correctAnswer}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Detectado:</Label>
                  <div className="font-mono bg-muted p-2 rounded">
                    {result.detectedAnswer || '(vazio)'}
                  </div>
                </div>
              </div>

              {editingQuestion === questionId && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">
                      Editar resposta detectada:
                    </Label>
                    
                    {/* Opções de resposta */}
                    <div className="flex gap-2 mb-3">
                      {availableOptions.map(option => (
                        <Button
                          key={option}
                          variant={result.detectedAnswer.includes(option) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleOption(questionId, option)}
                          className="w-10 h-10"
                        >
                          {option}
                        </Button>
                      ))}
                    </div>

                    {/* Ações rápidas */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => clearAnswer(questionId)}
                      >
                        Limpar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAsCorrect(questionId)}
                        className="text-green-600"
                      >
                        Marcar como Correta
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAsNullified(questionId)}
                        className="text-orange-600"
                      >
                        Anular Questão
                      </Button>
                    </div>
                  </div>

                  {/* Input manual */}
                  <div>
                    <Label className="text-sm font-medium mb-1 block">
                      Ou digite manualmente:
                    </Label>
                    <Input
                      value={result.detectedAnswer}
                      onChange={(e) => updateQuestionStatus(questionId, e.target.value.toUpperCase())}
                      placeholder="Ex: A, AB, ABCD"
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ações finais */}
      {hasChanges && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Você tem alterações não salvas
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onCancel}>
                  Descartar Alterações
                </Button>
                <Button onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Correção
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};