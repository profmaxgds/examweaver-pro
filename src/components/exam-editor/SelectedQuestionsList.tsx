import { useExamEditor } from './ExamEditorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';

export function SelectedQuestionsList() {
  const { examData, removeSelectedQuestion, setPreviewQuestion, setEditQuestion } = useExamEditor();

  if (!examData) return null;

  const totalPoints = examData.selectedQuestions.reduce((sum, q) => sum + q.points, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Questões Selecionadas ({examData.selectedQuestions.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Total: {totalPoints.toFixed(2)} pontos
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {examData.selectedQuestions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma questão selecionada.
            </p>
          )}
          {examData.selectedQuestions.map((question) => (
            <div key={question.id} className="flex items-center justify-between p-2 border rounded">
              <div className="flex-1">
                <p className="text-sm font-medium truncate">{question.title}</p>
                <p className="text-xs text-muted-foreground">{question.points} pontos</p>
              </div>
              <div className="flex space-x-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewQuestion(question)}>
                    <Eye className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditQuestion(question)}>
                    <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeSelectedQuestion(question.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}