import { useState, useEffect } from 'react';
import { useExamEditor } from './ExamEditorContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ExamHeaderEditor } from '@/components/ExamHeaderEditor';
import { Edit, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

// Interfaces
interface ExamHeader {
  id: string;
  name: string;
  institution: string;
}
interface Class {
  id: string;
  name: string;
}

export function ExamSettingsPanel() {
  const { examData, setExamData } = useExamEditor();
  const { user } = useAuth();
  const { toast } = useToast();
  const [headers, setHeaders] = useState<ExamHeader[]>([]);
  const [selectedHeader, setSelectedHeader] = useState<ExamHeader | null>(null);
  const [isHeaderDialogOpen, setHeaderDialogOpen] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<Class[]>([]);
  const [isConfirmDialogOpen, setConfirmDialogOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      const { data: headersData } = await supabase.from('exam_headers').select('id, name, institution').eq('author_id', user.id);
      setHeaders(headersData || []);
      const { data: classesData } = await supabase.from('classes').select('id, name').eq('author_id', user.id);
      setAvailableClasses(classesData || []);
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    if (examData?.header_id && headers.length > 0) {
      const foundHeader = headers.find(h => h.id === examData.header_id);
      setSelectedHeader(foundHeader || null);
    } else {
      setSelectedHeader(null);
    }
  }, [examData?.header_id, headers]);

  if (!examData) return null;

  const generationMode = examData.generation_mode || 'versions';

  const handleHeaderSelect = (header: ExamHeader) => {
    setExamData(prev => prev ? { ...prev, header_id: header.id } : prev);
    setHeaderDialogOpen(false);
  };

  const removeHeader = () => {
    setExamData(prev => prev ? { ...prev, header_id: undefined } : prev);
    setSelectedHeader(null);
  };

  const handleGenerationModeChange = async (checked: boolean) => {
    const newMode = checked ? 'class' : 'versions';
    
    // REGRA DE OURO: Se está a tentar voltar de 'class' para 'versions'
    if (generationMode === 'class' && newMode === 'versions') {
      // Verifica se existem provas preparadas
      const { count } = await supabase.from('student_exams').select('id', { count: 'exact', head: true }).eq('exam_id', examData.id);
      if (count && count > 0) {
        setConfirmDialogOpen(true); // Abre o diálogo de confirmação
        return; // Não altera o modo ainda
      }
    }
    
    // Se não houver conflito, altera o modo diretamente
    setExamData(prev => prev ? { ...prev, generation_mode: newMode } : prev);
  };

  const handleConfirmSwitchToVersions = async () => {
    if (!examData) return;
    // Apaga as provas preparadas
    const { error } = await supabase.from('student_exams').delete().eq('exam_id', examData.id);
    if (error) {
        toast({ title: "Erro", description: "Não foi possível apagar as provas preparadas.", variant: "destructive" });
    } else {
        toast({ title: "Sucesso", description: "Provas preparadas foram removidas." });
        // Altera o modo
        setExamData(prev => prev ? { ...prev, generation_mode: 'versions', target_class_id: undefined } : prev);
    }
  };


  return (
    <>
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Alterar Modo de Geração?</AlertDialogTitle>
            <AlertDialogDescription>
                Existem provas preparadas para uma turma. Se mudar para o modo "Versões", todas as provas individuais preparadas serão **permanentemente apagadas**. Deseja continuar?
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSwitchToVersions}>Sim, Apagar e Mudar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Dados da Prova</CardTitle></CardHeader>
          <CardContent className="space-y-4">
              <div>
                  <Label htmlFor="title">Título *</Label>
                  <Input id="title" value={examData.title} onChange={(e) => setExamData(prev => prev ? { ...prev, title: e.target.value } : prev)} />
              </div>
              <div>
                  <Label htmlFor="subject">Matéria *</Label>
                  <Input id="subject" value={examData.subject} onChange={(e) => setExamData(prev => prev ? { ...prev, subject: e.target.value } : prev)} />
              </div>
              <div>
                  <Label htmlFor="examDate">Data da Prova</Label>
                  <Input id="examDate" type="date" value={examData.examDate} onChange={(e) => setExamData(prev => prev ? { ...prev, examDate: e.target.value } : prev)} />
              </div>
              <div>
                  <Label htmlFor="timeLimit">Tempo Limite (minutos)</Label>
                  <Input id="timeLimit" type="number" value={examData.time_limit || ''} onChange={(e) => setExamData(prev => prev ? { ...prev, time_limit: e.target.value ? parseInt(e.target.value) : undefined } : prev)} placeholder="Ex: 120" />
              </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Configurações</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="layout">Layout</Label>
              <Select value={examData.layout} onValueChange={(value) => setExamData(prev => prev ? { ...prev, layout: value } : prev)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                      <SelectItem value="single_column">Uma Coluna</SelectItem>
                      <SelectItem value="double_column">Duas Colunas</SelectItem>
                  </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="shuffleQuestions" checked={examData.shuffleQuestions} onCheckedChange={(checked) => setExamData(prev => prev ? { ...prev, shuffleQuestions: !!checked } : prev)} />
                <Label htmlFor="shuffleQuestions">Embaralhar Questões</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="shuffleOptions" checked={examData.shuffleOptions} onCheckedChange={(checked) => setExamData(prev => prev ? { ...prev, shuffleOptions: !!checked } : prev)} />
                <Label htmlFor="shuffleOptions">Embaralhar Alternativas</Label>
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <Label className="font-semibold">Modo de Geração</Label>
              <div className="flex items-center space-x-2">
                <Label htmlFor="generation-mode">Versões</Label>
                <Switch
                  id="generation-mode"
                  checked={generationMode === 'class'}
                  onCheckedChange={handleGenerationModeChange}
                />
                <Label htmlFor="generation-mode">Turma</Label>
              </div>
              {generationMode === 'versions' ? (
                <div className="animate-in fade-in">
                  <Label htmlFor="versions">Número de Versões</Label>
                  <Input id="versions" type="number" min="1" max="10" value={examData.versions} onChange={(e) => setExamData(prev => prev ? { ...prev, versions: parseInt(e.target.value) || 1 } : prev)} />
                </div>
              ) : (
                <div className="animate-in fade-in">
                  <Label htmlFor="class-select">Selecionar Turma</Label>
                  <Select value={examData.target_class_id} onValueChange={(value) => setExamData(prev => prev ? { ...prev, target_class_id: value } : prev)}>
                    <SelectTrigger id="class-select"><SelectValue placeholder="Escolha uma turma..." /></SelectTrigger>
                    <SelectContent>{availableClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
              <CardTitle>Cabeçalho da Prova</CardTitle>
              {!selectedHeader && <CardDescription>Selecione um cabeçalho personalizado.</CardDescription>}
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-center">
              <Dialog open={isHeaderDialogOpen} onOpenChange={setHeaderDialogOpen}>
                  {selectedHeader ? (
                      <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 border rounded-md">
                              <div className="flex-grow">
                                  <p className="font-semibold">{selectedHeader.name}</p>
                                  <p className="text-sm text-muted-foreground">{selectedHeader.institution}</p>
                              </div>
                              <div className="flex">
                                  <DialogTrigger asChild>
                                      <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                                  </DialogTrigger>
                                  <Button variant="ghost" size="icon" onClick={removeHeader}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                          </div>
                      </div>
                  ) : (
                      <div className="text-center space-y-2">
                          <p className="text-sm text-muted-foreground">Nenhum cabeçalho selecionado.</p>
                           <DialogTrigger asChild><Button variant="outline">Selecionar Cabeçalho</Button></DialogTrigger>
                      </div>
                  )}
                   <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                          <DialogTitle>Selecione ou Crie um Cabeçalho</DialogTitle>
                      </DialogHeader>
                      <ExamHeaderEditor onSelect={handleHeaderSelect} selectedHeaderId={examData.header_id} />
                  </DialogContent>
              </Dialog>
          </CardContent>
        </Card>
      </div>
    </>
  );
}