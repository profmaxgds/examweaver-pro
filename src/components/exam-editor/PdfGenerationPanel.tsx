import { useExamEditor } from './ExamEditorContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Download, FileText } from 'lucide-react';

export function PdfGenerationPanel() {
  const { examData, loading, previewExam, generatePDF, generateAllPDFs } = useExamEditor();

  if (!examData) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gerar Arquivos da Prova</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={generateAllPDFs}
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Gerando...' : 'Gerar Todas as Versões e Gabaritos'}
          </Button>
          <div className="grid gap-4">
            {Array.from({ length: examData.versions }, (_, i) => i + 1).map(version => (
              <div key={version} className="flex items-center justify-between p-4 border rounded">
                <div>
                  <h4 className="font-medium">Versão {version}</h4>
                  <p className="text-sm text-muted-foreground">
                    {examData.shuffleQuestions ? 'Questões embaralhadas' : 'Questões em ordem'}
                    {examData.shuffleOptions ? ', alternativas embaralhadas' : ''}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => previewExam(version)}
                        disabled={loading}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Visualizar</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => generatePDF(version, false)}
                        disabled={loading}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Prova</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <Button
                        variant="outline"
                        size="icon"
                        onClick={() => generatePDF(version, true)}
                        disabled={loading}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Gabarito</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}