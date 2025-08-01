import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Search, 
  Edit2, 
  Eye, 
  Trash2, 
  Download,
  Filter,
  Calendar,
  User,
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CorrectionRecord {
  id: string;
  exam_id: string;
  student_name: string;
  student_identification: string;
  score: number;
  max_score: number;
  percentage: number;
  auto_corrected: boolean;
  correction_date: string;
  answers: any;
  image_url?: string;
  exam_title?: string;
}

export default function CorrectionsManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [corrections, setCorrections] = useState<CorrectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorrection, setSelectedCorrection] = useState<CorrectionRecord | null>(null);
  const [editingScore, setEditingScore] = useState<number | null>(null);
  const [editingFeedback, setEditingFeedback] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'auto' | 'manual'>('all');

  // Carregar correções
  useEffect(() => {
    if (user) {
      loadCorrections();
    }
  }, [user]);

  const loadCorrections = async () => {
    setLoading(true);
    try {
      // Buscar correções
      const { data: correctionsData, error } = await supabase
        .from('exam_corrections')
        .select('*')
        .eq('author_id', user!.id)
        .order('correction_date', { ascending: false });

      if (error) throw error;

      // Buscar títulos dos exames separadamente
      if (correctionsData && correctionsData.length > 0) {
        const examIds = [...new Set(correctionsData.map(c => c.exam_id))];
        const { data: examsData } = await supabase
          .from('exams')
          .select('id, title, subject')
          .in('id', examIds);

        const examTitles = Object.fromEntries(
          (examsData || []).map(exam => [exam.id, exam.title])
        );

        const formattedCorrections = correctionsData.map(correction => ({
          ...correction,
          exam_title: examTitles[correction.exam_id] || 'Prova sem título'
        }));

        setCorrections(formattedCorrections);
      } else {
        setCorrections([]);
      }
    } catch (error) {
      console.error('Erro ao carregar correções:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as correções.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtrar correções
  const filteredCorrections = corrections.filter(correction => {
    const matchesSearch = correction.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         correction.exam_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         correction.student_identification?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === 'all' || 
                         (filterType === 'auto' && correction.auto_corrected) ||
                         (filterType === 'manual' && !correction.auto_corrected);

    return matchesSearch && matchesFilter;
  });

  // Atualizar pontuação manualmente
  const updateScore = async (correctionId: string, newScore: number, feedback: string) => {
    try {
      const { error } = await supabase
        .from('exam_corrections')
        .update({
          score: newScore,
          percentage: (newScore / selectedCorrection!.max_score) * 100,
          auto_corrected: false,
          answers: {
            ...selectedCorrection!.answers,
            manual_feedback: feedback
          }
        })
        .eq('id', correctionId);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Pontuação atualizada com sucesso.",
      });

      loadCorrections();
      setSelectedCorrection(null);
      setEditingScore(null);
      setEditingFeedback('');
    } catch (error) {
      console.error('Erro ao atualizar pontuação:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a pontuação.",
        variant: "destructive",
      });
    }
  };

  // Deletar correção
  const deleteCorrection = async (correctionId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta correção?')) return;

    try {
      const { error } = await supabase
        .from('exam_corrections')
        .delete()
        .eq('id', correctionId);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Correção excluída com sucesso.",
      });

      loadCorrections();
    } catch (error) {
      console.error('Erro ao excluir correção:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a correção.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Gestão de Correções</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Filtros e busca */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros e Busca
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-64">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por aluno, prova ou ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant={filterType === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilterType('all')}
                    size="sm"
                  >
                    Todas
                  </Button>
                  <Button
                    variant={filterType === 'auto' ? 'default' : 'outline'}
                    onClick={() => setFilterType('auto')}
                    size="sm"
                  >
                    Automáticas
                  </Button>
                  <Button
                    variant={filterType === 'manual' ? 'default' : 'outline'}
                    onClick={() => setFilterType('manual')}
                    size="sm"
                  >
                    Manuais
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{corrections.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Automáticas</p>
                    <p className="text-2xl font-bold">
                      {corrections.filter(c => c.auto_corrected).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Edit2 className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Manuais</p>
                    <p className="text-2xl font-bold">
                      {corrections.filter(c => !c.auto_corrected).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Hoje</p>
                    <p className="text-2xl font-bold">
                      {corrections.filter(c => 
                        new Date(c.correction_date).toDateString() === new Date().toDateString()
                      ).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de correções */}
          <Card>
            <CardHeader>
              <CardTitle>Correções Realizadas</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 animate-spin mx-auto mb-4" />
                  <p>Carregando correções...</p>
                </div>
              ) : filteredCorrections.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma correção encontrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Prova</TableHead>
                      <TableHead>Pontuação</TableHead>
                      <TableHead>Percentual</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCorrections.map((correction) => (
                      <TableRow key={correction.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{correction.student_name}</p>
                            {correction.student_identification && (
                              <p className="text-sm text-muted-foreground">
                                ID: {correction.student_identification}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{correction.exam_title}</p>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono">
                            {correction.score}/{correction.max_score}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={correction.percentage >= 60 ? 'default' : 'destructive'}>
                            {correction.percentage.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={correction.auto_corrected ? 'secondary' : 'outline'}>
                            {correction.auto_corrected ? 'Auto' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(correction.correction_date).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedCorrection(correction)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Detalhes da Correção</DialogTitle>
                                </DialogHeader>
                                {selectedCorrection && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium">Aluno</label>
                                        <p>{selectedCorrection.student_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Prova</label>
                                        <p>{selectedCorrection.exam_title}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Pontuação Atual</label>
                                        <Input
                                          type="number"
                                          value={editingScore ?? selectedCorrection.score}
                                          onChange={(e) => setEditingScore(Number(e.target.value))}
                                          max={selectedCorrection.max_score}
                                          min={0}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Pontuação Máxima</label>
                                        <p>{selectedCorrection.max_score}</p>
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <label className="text-sm font-medium">Feedback Manual</label>
                                      <Textarea
                                        value={editingFeedback}
                                        onChange={(e) => setEditingFeedback(e.target.value)}
                                        placeholder="Adicione observações sobre a correção..."
                                        rows={3}
                                      />
                                    </div>
                                    
                                    <div className="flex gap-2 pt-4">
                                      <Button
                                        onClick={() => updateScore(
                                          selectedCorrection.id,
                                          editingScore ?? selectedCorrection.score,
                                          editingFeedback
                                        )}
                                        className="flex-1"
                                      >
                                        <Edit2 className="w-4 h-4 mr-2" />
                                        Salvar Alterações
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteCorrection(correction.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}