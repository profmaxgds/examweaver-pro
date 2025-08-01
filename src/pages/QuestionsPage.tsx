import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ActionButtons } from '@/components/ActionButtons'; // <-- Importado

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
  created_at: string;
}

export default function QuestionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    fetchQuestions();
  }, [user]);

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
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setQuestions(prev => prev.filter(q => q.id !== id));
      toast({
        title: "Sucesso",
        description: "Questão excluída com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao excluir questão:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a questão.",
        variant: "destructive",
      });
    }
  };

  const filteredQuestions = questions.filter(question => {
    const contentText = typeof question.content === 'string' ? question.content.replace(/<[^>]*>/g, '') : '';
    const matchesSearch = question.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contentText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (question.tags && question.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesSubject = !filterSubject || question.subject === filterSubject;
    const matchesDifficulty = !filterDifficulty || question.difficulty === filterDifficulty;
    const matchesType = !filterType || question.type === filterType;

    return matchesSearch && matchesSubject && matchesDifficulty && matchesType;
  });

  const subjects = [...new Set(questions.map(q => q.subject))].filter(Boolean);
  const difficulties = ['easy', 'medium', 'hard', 'custom'];
  const types = ['multiple_choice', 'true_false', 'essay'];

  const getTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'multiple_choice': 'Múltipla Escolha',
      'true_false': 'Verdadeiro/Falso',
      'essay': 'Dissertativa',
    };
    return labels[type] || type;
  };

  const getDifficultyLabel = (difficulty: string) => {
    const labels: { [key: string]: string } = {
      'easy': 'Fácil',
      'medium': 'Médio',
      'hard': 'Difícil',
      'custom': 'Personalizado'
    };
    return labels[difficulty] || difficulty;
  };

  const createPreview = (htmlContent: string | null) => {
    if (!htmlContent) return 'Questão sem enunciado...';
    
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    const text = doc.body.textContent || "";

    if (text.length > 150) {
      return text.substring(0, 150) + '...';
    }
    return text;
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
              <h1 className="text-2xl font-bold">Banco de Questões</h1>
            </div>
            <Link to="/questions/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Questão
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar questões..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterSubject} onValueChange={(value) => setFilterSubject(value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as matérias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as matérias</SelectItem>
                  {subjects.map(subject => (
                    <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterDifficulty} onValueChange={(value) => setFilterDifficulty(value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as dificuldades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as dificuldades</SelectItem>
                  {difficulties.map(difficulty => (
                    <SelectItem key={difficulty} value={difficulty}>
                      {getDifficultyLabel(difficulty)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={(value) => setFilterType(value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {types.map(type => (
                    <SelectItem key={type} value={type}>
                      {getTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setFilterSubject('');
                  setFilterDifficulty('');
                  setFilterType('');
                }}
              >
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8">
            <p>Carregando questões...</p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">
                {questions.length === 0 
                  ? "Você ainda não tem questões cadastradas."
                  : "Nenhuma questão encontrada com os filtros aplicados."
                }
              </p>
              <Link to="/questions/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Primeira Questão
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredQuestions.map((question) => (
              <Card key={question.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">{question.title}</h3>
                      <div className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {createPreview(question.content)}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{getTypeLabel(question.type)}</Badge>
                        <Badge variant="outline">{getDifficultyLabel(question.difficulty)}</Badge>
                        <Badge variant="outline">{question.points} pontos</Badge>
                        <Badge variant="secondary">{question.subject}</Badge>
                        {question.category && (
                          <Badge variant="secondary">{question.category}</Badge>
                        )}
                        {question.tags && question.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="ml-4">
                      {/* REFATORADO AQUI */}
                      <ActionButtons 
                        entityName="questão"
                        onEdit={() => navigate(`/questions/${question.id}/edit`)}
                        onDelete={() => deleteQuestion(question.id)}
                        onCopy={() => alert('Função duplicar não implementada.')} // Exemplo
                      />
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
                    <span>
                      Criada em {new Date(question.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}