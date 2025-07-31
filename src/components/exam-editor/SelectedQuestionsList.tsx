import { useState, useEffect } from 'react';
import { useExamEditor } from './ExamEditorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

export function SelectedQuestionsList() {
  const { examData, removeSelectedQuestion, setPreviewQuestion, setEditQuestion } = useExamEditor();
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    // Resetar para a primeira página se o número de questões mudar
    setCurrentPage(1);
  }, [examData?.selectedQuestions.length]);

  if (!examData) return null;

  const totalPoints = examData.selectedQuestions.reduce((sum, q) => sum + q.points, 0);

  const pageCount = Math.ceil(examData.selectedQuestions.length / ITEMS_PER_PAGE);
  const paginatedQuestions = examData.selectedQuestions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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
      <CardContent className="space-y-4">
        <div className="space-y-2 h-[22rem] overflow-y-auto pr-2">
          {paginatedQuestions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma questão selecionada.
            </p>
          )}
          {paginatedQuestions.map((question) => (
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
        {pageCount > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(p - 1, 1)); }}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
               <PaginationItem>
                 <span className="text-sm p-2">{currentPage} de {pageCount}</span>
               </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(p + 1, pageCount)); }}
                  className={currentPage === pageCount ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </CardContent>
    </Card>
  );
}