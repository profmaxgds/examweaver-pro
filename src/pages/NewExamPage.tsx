import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

interface Question {
  id: string;
  title: string;
  content: any;
  type: string;
  subject: string;
  category: string | null;
  difficulty: string;
  tags: string[];
  points: number;
}

interface ExamData {
  title: string;
  subject: string;
  institution: string;
  examDate: string;
  selectedQuestions: Question[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  versions: number;
  layout: string;
}

export default function NewExamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  
  const [examData, setExamData] = useState<ExamData>({
    title: '',
    subject: '',
    institution: '',
    examDate: '',
    selectedQuestions: [],
    shuffleQuestions: false,
    shuffleOptions: false,
    versions: 1,
    layout: 'single_column',
  });

  useEffect(() => {
    fetchQuestions();
  }, [user]);

  useEffect(() => {
    let filtered = questions;
    
    if (searchTerm) {
      filtered = filtered.filter(q => 
        q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (typeof q.content === 'string' && q.content.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (filterSubject) {
      filtered = filtered.filter(q => q.subject === filterSubject);
    }
    
    setFilteredQuestions(filtered);
  }, [questions, searchTerm, filterSubject]);

  const fetchQuestions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Erro ao buscar questões:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as questões.",
        variant: "destructive",
      });
    }
  };

  const toggleQuestionSelection = (question: Question) => {
    setExamData(prev => ({
      ...prev,
      selectedQuestions: prev.selectedQuestions.find(q => q.id === question.id)
        ? prev.selectedQuestions.filter(q => q.id !== question.id)
        : [...prev.selectedQuestions, question]
    }));
  };

  const removeSelectedQuestion = (questionId: string) => {
    setExamData(prev => ({
      ...prev,
      selectedQuestions: prev.selectedQuestions.filter(q => q.id !== questionId)
    }));
  };

  const totalPoints = examData.selectedQuestions.reduce((sum, q) => sum + q.points, 0);
  const subjects = [...new Set(questions.map(q => q.subject))].filter(Boolean);

  const handleSave = async () => {
    if (!user) return;

    if (!examData.title.trim() || !examData.subject.trim() || examData.selectedQuestions.length === 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios e selecione pelo menos uma questão.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const insertData = {
        author_id: user.id,
        title: examData.title,
        subject: examData.subject,
        institution: examData.institution || null,
        exam_date: examData.examDate ? new Date(examData.examDate).toISOString() : null,
        question_ids: examData.selectedQuestions.map(q => q.id),
        total_points: totalPoints,
        layout: examData.layout,
        shuffle_questions: examData.shuffleQuestions,
        shuffle_options: examData.shuffleOptions,
        versions: examData.versions,
        header: {
          institution: examData.institution,
          subject: examData.subject,
        },
        answer_sheet: {
          position: 'separate'
        }
      };

      const { data, error } = await supabase
        .from('exams')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Prova criada com sucesso.",
      });

      navigate('/exams');
    } catch (error) {
      console.error('Erro ao salvar prova:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a prova. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/exams">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Nova Prova</h1>
            </div>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar Prova'}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Configurações da Prova */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados da Prova</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={examData.title}
                    onChange={(e) => setExamData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ex: Prova de Teoria Geral dos Sistemas"
                  />
                </div>

                <div>
                  <Label htmlFor="subject">Matéria *</Label>
                  <Input
                    id="subject"
                    value={examData.subject}
                    onChange={(e) => setExamData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Ex: Teoria Geral dos Sistemas"
                  />
                </div>

                <div>
                  <Label htmlFor="institution">Instituição</Label>
                  <Input
                    id="institution"
                    value={examData.institution}
                    onChange={(e) => setExamData(prev => ({ ...prev, institution: e.target.value }))}
                    placeholder="Ex: UNIUBE"
                  />
                </div>

                <div>
                  <Label htmlFor="examDate">Data da Prova</Label>
                  <Input
                    id="examDate"
                    type="date"
                    value={examData.examDate}
                    onChange={(e) => setExamData(prev => ({ ...prev, examDate: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="layout">Layout</Label>
                  <Select value={examData.layout} onValueChange={(value) => setExamData(prev => ({ ...prev, layout: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_column">Uma Coluna</SelectItem>
                      <SelectItem value="double_column">Duas Colunas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="versions">Número de Versões</Label>
                  <Input
                    id="versions"
                    type="number"
                    min="1"
                    max="10"
                    value={examData.versions}
                    onChange={(e) => setExamData(prev => ({ ...prev, versions: parseInt(e.target.value) || 1 }))}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="shuffleQuestions"
                      checked={examData.shuffleQuestions}
                      onCheckedChange={(checked) => setExamData(prev => ({ ...prev, shuffleQuestions: !!checked }))}
                    />
                    <Label htmlFor="shuffleQuestions">Embaralhar Questões</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="shuffleOptions"
                      checked={examData.shuffleOptions}
                      onCheckedChange={(checked) => setExamData(prev => ({ ...prev, shuffleOptions: !!checked }))}
                    />
                    <Label htmlFor="shuffleOptions">Embaralhar Alternativas</Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Questões Selecionadas */}
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
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {examData.selectedQuestions.map((question) => (
                    <div key={question.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">{question.title}</p>
                        <p className="text-xs text-muted-foreground">{question.points} pontos</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSelectedQuestion(question.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {examData.selectedQuestions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma questão selecionada
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Banco de Questões */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Questões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar questões..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={filterSubject} onValueChange={setFilterSubject}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por matéria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas as matérias</SelectItem>
                      {subjects.map(subject => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredQuestions.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        {questions.length === 0 
                          ? "Você ainda não tem questões cadastradas."
                          : "Nenhuma questão encontrada com os filtros aplicados."
                        }
                      </p>
                      {questions.length === 0 && (
                        <Link to="/questions/new" className="mt-4 inline-block">
                          <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Criar Questão
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    filteredQuestions.map((question) => {
                      const isSelected = examData.selectedQuestions.some(q => q.id === question.id);
                      return (
                        <div
                          key={question.id}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => toggleQuestionSelection(question)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium mb-1">{question.title}</h4>
                              <div className="flex flex-wrap gap-1 mb-2">
                                <Badge variant="outline" className="text-xs">{question.type}</Badge>
                                <Badge variant="outline" className="text-xs">{question.difficulty}</Badge>
                                <Badge variant="outline" className="text-xs">{question.points} pts</Badge>
                                <Badge variant="secondary" className="text-xs">{question.subject}</Badge>
                              </div>
                            </div>
                            <Checkbox checked={isSelected} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}