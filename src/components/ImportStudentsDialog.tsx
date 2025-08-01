// src/components/ImportStudentsDialog.tsx

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollArea } from './ui/scroll-area';

interface ImportStudentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void; // Para atualizar a lista de alunos
}

interface ParsedStudent {
  name?: string;
  student_id?: string;
  email?: string;
  course?: string;
  institution_header_id?: string;
  class_id?: string;
}

export function ImportStudentsDialog({ isOpen, onClose, onImported }: ImportStudentsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [parsedData, setParsedData] = useState<ParsedStudent[]>([]);
  const [loading, setLoading] = useState(false);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Mapeia os nomes das colunas para os nomes esperados pelo banco
          const mappedData = results.data.map((row: any) => ({
            name: row.name || row.nome,
            student_id: row.student_id || row.matricula,
            email: row.email,
            course: row.course || row.curso,
            institution_header_id: row.institution_header_id || row.id_instituicao,
            class_id: row.class_id || row.id_turma,
          }));
          setParsedData(mappedData as ParsedStudent[]);
        },
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'text/csv': ['.csv'] } });

  const handleImport = async () => {
    if (!user || parsedData.length === 0) return;
    setLoading(true);

    const studentsToInsert = parsedData.map(student => ({
      ...student,
      author_id: user.id,
    }));

    const { error } = await supabase.from('students').insert(studentsToInsert.map(student => ({
      ...student,
      name: student.name || 'Nome não informado'
    })));

    if (error) {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sucesso!", description: `${studentsToInsert.length} alunos importados.` });
      onImported();
      onClose();
    }
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar Alunos via CSV</DialogTitle>
          <DialogDescription>
            Envie um arquivo CSV com as colunas: `name`, `student_id`, `email`, `course`, `institution_header_id`, `class_id`.
          </DialogDescription>
        </DialogHeader>
        
        <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer ${isDragActive ? 'border-primary' : ''}`}>
          <input {...getInputProps()} />
          <p>Arraste e solte o arquivo CSV aqui, ou clique para selecionar.</p>
        </div>

        {parsedData.length > 0 && (
          <>
            <h3 className="font-semibold mt-4">Pré-visualização dos Dados</h3>
            <ScrollArea className="h-64 border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Matrícula</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
                <TableBody>
                  {parsedData.slice(0, 10).map((row, i) => (
                    <TableRow key={i}><TableCell>{row.name}</TableCell><TableCell>{row.student_id}</TableCell><TableCell>{row.email}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <p className="text-sm text-muted-foreground">Mostrando as primeiras 10 linhas de {parsedData.length} registros encontrados.</p>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleImport} disabled={loading || parsedData.length === 0}>
            {loading ? 'Importando...' : `Importar ${parsedData.length} Alunos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}