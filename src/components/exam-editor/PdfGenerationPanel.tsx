// src/components/exam-editor/PdfGenerationPanel.tsx

import { useState, useEffect } from 'react';
import { useExamEditor } from './ExamEditorContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, Download, FileText, User, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Interface para os dados da prova preparada
interface PreparedExam {
  id: string; // Este é o student_exam_id
  student: {
    name: string;
    student_id: string | null;
  }
}

export function PdfGenerationPanel() {
  const { examData, loading, previewExam, generatePDF, generateAllPDFs, toast } = useExamEditor();
  const [preparedExams, setPreparedExams] = useState<PreparedExam[]>([]);
  const [isListLoading, setListLoading] = useState(false);

  useEffect(() => {
    const fetchPreparedExams = async () => {
      if (examData?.generation_mode === 'class' && examData.id) {
        setListLoading(true);
        const { data: studentExams, error } = await supabase
          .from('student_exams')
          .select('id, student_id')
          .eq('exam_id', examData.id);
        
        if (error) {
          console.error("Erro ao buscar student_exams:", error);
          return;
        }
        
        // Buscar dados dos estudantes separadamente
        const preparedExamsData = await Promise.all(
          (studentExams || []).map(async (se) => {
            const { data: student } = await supabase
              .from('students')
              .select('name, student_id')
              .eq('id', se.student_id)
              .single();
            return {
              id: se.id,
              student: student || { name: 'Nome não encontrado', student_id: null }
            };
          })
        );
        
        setPreparedExams(preparedExamsData as PreparedExam[]);
        setListLoading(false);
      } else {
        setPreparedExams([]);
      }
    };
    fetchPreparedExams();
  }, [examData?.generation_mode, examData?.id]);

  if (!examData) return null;

  const isLoading = loading;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gerar Arquivos da Prova</CardTitle>
          <CardDescription>
            {examData.generation_mode === 'class'
              ? `As provas foram preparadas. Agora você pode gerar os PDFs individuais.`
              : `Gere ${examData.versions} ${examData.versions > 1 ? 'versões' : 'versão'} da prova.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={generateAllPDFs} disabled={isLoading} className="w-full">
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando...</> : 'Gerar e Baixar Todas as Provas (.zip)'}
          </Button>
          
          <div className="grid gap-4 max-h-96 overflow-y-auto pr-2">
            {isListLoading ? <Loader2 className="animate-spin mx-auto my-4" /> : 
            
            examData.generation_mode === 'class' ? (
                preparedExams.length > 0 ? preparedExams.map(pExam => (
                  <div key={pExam.id} className="flex items-center justify-between p-3 border rounded-md">
                    <div>
                        <p className="font-medium text-sm flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{pExam.student.name}</p>
                        <p className="text-xs text-muted-foreground pl-6">Matrícula: {pExam.student.student_id || 'N/A'}</p>
                    </div>
                    <div className="flex space-x-2">
                       <Tooltip>
                         <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => previewExam(pExam.id)} disabled={isLoading}><Eye className="w-4 h-4" /></Button></TooltipTrigger>
                         <TooltipContent><p>Pré-visualizar</p></TooltipContent>
                       </Tooltip>
                       <Tooltip>
                         <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => generatePDF(pExam.id, false)} disabled={isLoading}><Download className="w-4 h-4" /></Button></TooltipTrigger>
                         <TooltipContent><p>Gerar Prova</p></TooltipContent>
                       </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => generatePDF(pExam.id, true)} disabled={isLoading}><FileText className="w-4 h-4" /></Button></TooltipTrigger>
                        <TooltipContent><p>Gabarito</p></TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground text-center py-4">Nenhuma prova preparada para esta turma. Volte e clique em "Preparar Provas".</p>
              ) : (
                Array.from({ length: examData.versions }, (_, i) => i + 1).map(version => (
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
                         <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => previewExam(version)} disabled={isLoading}><Eye className="w-4 h-4" /></Button></TooltipTrigger>
                         <TooltipContent><p>Pré-visualizar</p></TooltipContent>
                       </Tooltip>
                       <Tooltip>
                         <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => generatePDF(version, false)} disabled={isLoading}><Download className="w-4 h-4" /></Button></TooltipTrigger>
                         <TooltipContent><p>Gerar Prova</p></TooltipContent>
                       </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => generatePDF(version, true)} disabled={isLoading}><FileText className="w-4 h-4" /></Button></TooltipTrigger>
                        <TooltipContent><p>Gabarito</p></TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}