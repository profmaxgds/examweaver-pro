import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ScanLine } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CorrectionScanner } from '@/components/CorrectionScanner';

interface Exam {
  id: string;
  title: string;
  subject: string;
}

export default function CorrectionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  useEffect(() => {
    fetchExams();
  }, [user]);

  const fetchExams = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, subject')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      console.error('Erro ao buscar provas:', error);
      toast({ title: "Erro", description: "Não foi possível carregar as provas.", variant: "destructive" });
    }
  };

  const selectedExam = exams.find(exam => exam.id === selectedExamId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Correção Automática</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Selecione a Prova</CardTitle>
              <CardDescription>Escolha a prova que você deseja corrigir.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select onValueChange={setSelectedExamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma prova..." />
                </SelectTrigger>
                <SelectContent>
                  {exams.map(exam => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.title} ({exam.subject})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedExamId && selectedExam && (
            <Card>
              <CardHeader>
                <CardTitle>2. Digitalize a Folha de Respostas</CardTitle>
                <CardDescription>Use a câmera ou envie um arquivo de imagem da prova de "{selectedExam.title}".</CardDescription>
              </CardHeader>
              <CardContent>
                <CorrectionScanner examId={selectedExamId} />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}