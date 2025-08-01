import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, FileText, User, Calendar, CheckCircle, Eye, Download, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AutoCorrectionScanner } from '@/components/AutoCorrectionScanner';
import { toast } from 'sonner';

interface Correction {
  id: string;
  exam_id: string;
  student_name: string;
  student_identification: string | null;
  score: number;
  max_score: number;
  percentage: number;
  correction_date: string;
  auto_corrected: boolean;
  image_url: string | null;
  answers: Record<string, string>;
  exam?: {
    title: string;
    subject: string;
  };
}

export default function CorrectionsPage() {
  const { user } = useAuth();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [filteredCorrections, setFilteredCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (user) {
      loadCorrections();
    }
  }, [user]);

  useEffect(() => {
    filterCorrections();
  }, [corrections, searchTerm, statusFilter]);

  const loadCorrections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('exam_corrections')
        .select('*')
        .eq('author_id', user.id)
        .order('correction_date', { ascending: false });

      if (error) {
        console.error('Erro ao carregar correções:', error);
        toast.error('Erro ao carregar correções');
        return;
      }

      // Buscar dados dos exames separadamente
      const correctionsWithExam: Correction[] = [];
      if (data) {
        for (const correction of data) {
          const { data: examData } = await supabase
            .from('exams')
            .select('title, subject')
            .eq('id', correction.exam_id)
            .single();

          correctionsWithExam.push({
            ...correction,
            answers: typeof correction.answers === 'object' && correction.answers !== null 
              ? correction.answers as Record<string, string>
              : {},
            auto_corrected: correction.auto_corrected || false,
            exam: examData || undefined
          });
        }
      }

      setCorrections(correctionsWithExam);
    } catch (error) {
      console.error('Erro ao carregar correções:', error);
      toast.error('Erro ao carregar correções');
    } finally {
      setLoading(false);
    }
  };

  const filterCorrections = () => {
    let filtered = corrections;

    if (searchTerm) {
      filtered = filtered.filter(correction =>
        correction.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        correction.student_identification?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        correction.exam?.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        correction.exam?.subject.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'auto') {
        filtered = filtered.filter(correction => correction.auto_corrected);
      } else if (statusFilter === 'manual') {
        filtered = filtered.filter(correction => !correction.auto_corrected);
      }
    }

    setFilteredCorrections(filtered);
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-100 text-green-800';
    if (percentage >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const downloadCorrection = async (correction: Correction) => {
    try {
      // Criar CSV com os dados da correção
      const csvData = [
        ['Aluno', 'Identificação', 'Prova', 'Matéria', 'Pontuação', 'Nota Máxima', 'Percentual', 'Data'],
        [
          correction.student_name,
          correction.student_identification || '',
          correction.exam?.title || '',
          correction.exam?.subject || '',
          correction.score.toString(),
          correction.max_score.toString(),
          `${correction.percentage.toFixed(1)}%`,
          new Date(correction.correction_date).toLocaleDateString('pt-BR')
        ]
      ];

      const csvContent = csvData.map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `correcao_${correction.student_name}_${new Date(correction.correction_date).toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('Erro ao baixar correção:', error);
      toast.error('Erro ao baixar correção');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
              <h1 className="text-2xl font-bold">Correções</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground">
              Gerencie e visualize as correções de provas realizadas
            </p>
          </div>

          {/* Scanner de Correção Automática */}
          <AutoCorrectionScanner />

          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Correções Realizadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Pesquisar por aluno, identificação, prova ou matéria..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Tipo de correção" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="auto">Automáticas</SelectItem>
                    <SelectItem value="manual">Manuais</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredCorrections.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'Nenhuma correção encontrada com os filtros aplicados'
                      : 'Nenhuma correção encontrada'
                    }
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
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
                            <div>
                              <p className="font-medium">{correction.exam?.title}</p>
                              <p className="text-sm text-muted-foreground">{correction.exam?.subject}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {correction.score.toFixed(2)} / {correction.max_score.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getGradeColor(correction.percentage)}>
                              {correction.percentage.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={correction.auto_corrected ? "default" : "secondary"}>
                              {correction.auto_corrected ? (
                                <>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Automática
                                </>
                              ) : (
                                <>
                                  <User className="h-3 w-3 mr-1" />
                                  Manual
                                </>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {new Date(correction.correction_date).toLocaleDateString('pt-BR')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {correction.image_url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(correction.image_url, '_blank')}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => downloadCorrection(correction)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}