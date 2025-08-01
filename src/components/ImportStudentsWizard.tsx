import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollArea } from './ui/scroll-area';
import { AlertCircle, HelpCircle, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Input } from './ui/input';

interface ImportStudentsWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  onGoToCreateClass: () => void;
}

interface ParsedStudent {
  nome?: string;
  matricula?: string;
  email?: string;
  [key: string]: any;
}

interface Class {
  id: string;
  name: string;
  year: number | null;
  semester: number | null;
  exam_headers: {
    id: string;
    institution: string | null
  } | null;
}

export function ImportStudentsWizard({ isOpen, onClose, onImported, onGoToCreateClass }: ImportStudentsWizardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [validStudents, setValidStudents] = useState<ParsedStudent[]>([]);
  const [invalidStudents, setInvalidStudents] = useState<ParsedStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [noClassesFound, setNoClassesFound] = useState(false);
  const [isEditMode, setEditMode] = useState(false);

  const fetchClasses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('classes')
      .select(`id, name, year, semester, exam_headers:institution_header_id (id, institution)`)
      .eq('author_id', user.id);
    setLoading(false);
    if (error) {
      console.error("Erro ao buscar detalhes das turmas:", error);
      toast({ title: "Erro", description: "Não foi possível carregar os detalhes.", variant: "destructive" });
    } else {
      setClasses(data as Class[] || []);
      setNoClassesFound((data || []).length === 0);
    }
  }, [user, toast]);

  useEffect(() => {
    if (isOpen) {
      resetWizard();
      fetchClasses();
    }
  }, [isOpen]);

  const resetWizard = () => {
    setStep(1);
    setSelectedClass(null);
    setValidStudents([]);
    setInvalidStudents([]);
    setLoading(false);
    setNoClassesFound(false);
    setEditMode(false);
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const revalidateData = (allStudents: ParsedStudent[]) => {
    const valid: ParsedStudent[] = [];
    const invalid: ParsedStudent[] = [];
    allStudents.forEach(row => {
      if (row.matricula && String(row.matricula).trim() !== '') {
        valid.push(row);
      } else {
        invalid.push(row);
      }
    });
    setValidStudents(valid);
    setInvalidStudents(invalid);
  };
  
  const processData = (data: any[]) => {
    const requiredHeaders = ['nome', 'matricula'];
    if (!data.length) return;
    const headers = Object.keys(data[0]).map(h => h.toLowerCase().trim());
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      toast({ title: "Colunas Faltando", description: `Seu arquivo precisa ter as colunas: ${missingHeaders.join(', ')}.`, variant: "destructive" });
      return;
    }
    const normalizedData = data.map(row => {
        const normalizedRow: ParsedStudent = {};
        for (const key in row) {
          normalizedRow[key.toLowerCase().trim()] = row[key];
        }
        return normalizedRow;
    });
    revalidateData(normalizedData);
    setStep(3);
  };

  const handleValidStudentChange = (index: number, field: keyof ParsedStudent, value: string) => {
    const updatedStudents = [...validStudents];
    updatedStudents[index] = { ...updatedStudents[index], [field]: value };
    setValidStudents(updatedStudents);
  };

  const handleInvalidStudentChange = (index: number, field: keyof ParsedStudent, value: string) => {
    const updatedStudents = [...invalidStudents];
    updatedStudents[index] = { ...updatedStudents[index], [field]: value };
    setInvalidStudents(updatedStudents);
  };

  const handleSaveChanges = () => {
    const allStudents = [...validStudents, ...invalidStudents];
    revalidateData(allStudents);
    setEditMode(false);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const binaryStr = event.target?.result;
        try {
          if (file.name.endsWith('.csv')) {
            Papa.parse(binaryStr as string, {
              header: true, skipEmptyLines: true, transformHeader: header => header.toLowerCase().trim(),
              complete: (results) => processData(results.data),
            });
          } else {
            const workbook = XLSX.read(binaryStr, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            processData(json);
          }
        } catch (e) {
          console.error("Erro ao processar arquivo:", e);
          toast({ title: "Erro de Leitura", description: "Não foi possível ler o arquivo.", variant: "destructive" });
        }
      };
      if (file.name.endsWith('.csv')) { reader.readAsText(file); } else { reader.readAsBinaryString(file); }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    multiple: false
  });

  const handleImport = async () => {
    if (!user || validStudents.length === 0 || !selectedClass || isEditMode) return;
    setLoading(true);
    const studentsToInsert = validStudents.map(student => ({
      name: student.nome,
      student_id: String(student.matricula),
      email: student.email,
      class_id: selectedClass.id,
      institution_header_id: selectedClass.exam_headers?.id,
      author_id: user.id,
    }));
    const { error } = await supabase.from('students').insert(studentsToInsert);
    setLoading(false);
    if (error) {
      console.error("Erro detalhado ao importar alunos:", error);
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sucesso!", description: `${studentsToInsert.length} alunos importados para a turma ${selectedClass.name}.` });
      onImported();
      handleClose();
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        if (loading) return <div className='py-6 text-center'>Carregando turmas...</div>;
        if (noClassesFound) {
          return (
            <div className="py-6 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma turma cadastrada</h3>
              <p className="mt-1 text-sm text-muted-foreground">Você precisa cadastrar uma turma antes de importar alunos.</p>
              <Button className="mt-4" onClick={() => { handleClose(); onGoToCreateClass(); }}>Cadastrar Turma</Button>
            </div>
          );
        }
        return (
          <div className="py-6 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Passo 1: Selecione a Turma</h3>
              <p className="text-sm text-muted-foreground mb-4">Para qual turma você deseja importar os alunos?</p>
              <Select onValueChange={(value) => setSelectedClass(classes.find(c => c.id === value) || null)}>
                <SelectTrigger><SelectValue placeholder="Selecione uma turma..." /></SelectTrigger>
                <SelectContent>{classes.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {selectedClass && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Detalhes da Turma Selecionada</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p><strong>Turma:</strong> {selectedClass.name}</p>
                  {(selectedClass.year || selectedClass.semester) && <p><strong>Ano/Semestre:</strong> {selectedClass.year || 'N/A'} / {selectedClass.semester || 'N/A'}</p>}
                  <p><strong>Instituição:</strong> {selectedClass.exam_headers?.institution || 'Não especificada'}</p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
      case 2:
        return (
          <div className="py-6">
            <h3 className="font-semibold mb-2 flex items-center">Passo 2: Envie o Arquivo
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild><HelpCircle className="w-4 h-4 ml-2 cursor-help" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                            <p className="font-bold">Formato do Arquivo:</p>
                            <p>Use um arquivo CSV ou Excel (.csv, .xlsx, .xls) com as colunas: `nome`, `matricula`, `email` (opcional).</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </h3>
            <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer ${isDragActive ? 'border-primary' : ''}`}>
              <input {...getInputProps()} />
              <p>Arraste e solte o arquivo aqui, ou clique para selecionar.</p>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="py-6 space-y-4">
            <div className='flex justify-between items-center'>
              <div>
                <h3 className="font-semibold">Passo 3: Confirme e Corrija os Dados</h3>
                <p className="text-sm text-muted-foreground">Importando para a turma: <strong>{selectedClass?.name}</strong>.</p>
              </div>
              {isEditMode ? (
                <Button onClick={handleSaveChanges}><CheckCircle2 className="w-4 h-4 mr-2" />Concluir Edição</Button>
              ) : (
                <Button variant="outline" onClick={() => setEditMode(true)}><Pencil className="w-4 h-4 mr-2" />Revisar / Editar Dados</Button>
              )}
            </div>
            {invalidStudents.length > 0 && !isEditMode && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{invalidStudents.length} linha(s) com erro serão ignoradas!</AlertTitle>
                <AlertDescription>As linhas destacadas em vermelho não possuem matrícula. Clique em "Editar" para corrigi-las.</AlertDescription>
              </Alert>
            )}
            <ScrollArea className="h-64 border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Matrícula</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
                <TableBody>
                  {validStudents.map((row, i) => (
                    <TableRow key={`valid-${i}`}>
                      {isEditMode ? (<>
                          <TableCell><Input value={row.nome || ''} onChange={(e) => handleValidStudentChange(i, 'nome', e.target.value)} /></TableCell>
                          <TableCell><Input value={row.matricula || ''} onChange={(e) => handleValidStudentChange(i, 'matricula', e.target.value)} /></TableCell>
                          <TableCell><Input value={row.email || ''} onChange={(e) => handleValidStudentChange(i, 'email', e.target.value)} /></TableCell>
                      </>) : (<>
                          <TableCell>{row.nome}</TableCell>
                          <TableCell>{row.matricula}</TableCell>
                          <TableCell>{row.email || 'N/A'}</TableCell>
                      </>)}
                    </TableRow>
                  ))}
                  {invalidStudents.map((row, i) => (
                    <TableRow key={`invalid-${i}`} className={!isEditMode ? "bg-destructive/10" : ""}>
                      {isEditMode ? (<>
                           <TableCell><Input value={row.nome || ''} onChange={(e) => handleInvalidStudentChange(i, 'nome', e.target.value)} /></TableCell>
                           <TableCell><Input placeholder="Preencha a matrícula" value={row.matricula || ''} onChange={(e) => handleInvalidStudentChange(i, 'matricula', e.target.value)} className="border-destructive" /></TableCell>
                           <TableCell><Input value={row.email || ''} onChange={(e) => handleInvalidStudentChange(i, 'email', e.target.value)} /></TableCell>
                      </>) : (<>
                          <TableCell className="text-destructive">{row.nome || '[Sem nome]'}</TableCell>
                          <TableCell className="text-destructive font-medium">{row.matricula || '[MATRÍCULA AUSENTE]'}</TableCell>
                          <TableCell className="text-destructive">{row.email || 'N/A'}</TableCell>
                      </>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Assistente de Importação de Alunos</DialogTitle>
          <DialogDescription>Siga os passos para importar seus alunos de forma rápida e fácil.</DialogDescription>
        </DialogHeader>
        {renderStepContent()}
        <DialogFooter>
          {step > 1 && !noClassesFound && <Button variant="ghost" onClick={() => setStep(step - 1)}>Voltar</Button>}
          {step === 1 && !noClassesFound && <Button onClick={() => setStep(2)} disabled={!selectedClass}>Próximo</Button>}
          {step === 3 && <Button onClick={handleImport} disabled={loading || validStudents.length === 0 || isEditMode}>
            {isEditMode ? 'Conclua a edição para importar' : (loading ? 'Importando...' : `Importar ${validStudents.length} Aluno(s)`)}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}