// src/pages/EditQuestionPage.tsx

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { QuestionEditor } from '@/components/QuestionEditor';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

// Reutilizamos a interface do QuestionEditor
interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface QuestionData {
  title: string;
  content: string;
  type: 'multiple_choice' | 'true_false' | 'essay';
  options: Option[];
  correctAnswer: any;
  category: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  points: number;
}

export default function EditQuestionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [initialData, setInitialData] = useState<QuestionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuestion = async () => {
      if (!id || !user) return;

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .eq('id', id)
          .eq('author_id', user.id)
          .single();

        if (error || !data) {
          throw error || new Error("Questão não encontrada");
        }

        // Transforma os dados do Supabase para o formato que o QuestionEditor espera
        const formattedData: QuestionData = {
          title: data.title,
          content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content),
          type: data.type as 'multiple_choice' | 'true_false' | 'essay',
          category: data.category || '',
          subject: data.subject,
          difficulty: data.difficulty === 'custom' ? 'medium' : data.difficulty,
          tags: data.tags || [],
          points: data.points,
          options: data.options ? (Array.isArray(data.options) ? data.options.map((opt: any) => ({
            id: opt.id,
            text: opt.text,
            isCorrect: Array.isArray(data.correct_answer) ? data.correct_answer.includes(opt.id) : false
          })) : []) : [],
          correctAnswer: data.correct_answer,
        };

        setInitialData(formattedData);
      } catch (error) {
        console.error('Erro ao buscar questão:', error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar a questão para edição.",
          variant: "destructive",
        });
        navigate('/questions');
      } finally {
        setLoading(false);
      }
    };

    fetchQuestion();
  }, [id, user, navigate, toast]);

  const handleUpdate = async (questionData: QuestionData) => {
    if (!id || !user) return;

    setLoading(true);
    try {
      // Prepara os dados para o update
      const updateData = {
        title: questionData.title,
        content: questionData.content,
        type: questionData.type,
        options: questionData.type === 'multiple_choice' ? questionData.options.map(({ id, text }) => ({ id, text })) : null,
        correct_answer: questionData.type === 'multiple_choice'
          ? questionData.options.filter(opt => opt.isCorrect).map(opt => opt.id)
          : questionData.correctAnswer,
        category: questionData.category || null,
        subject: questionData.subject,
        difficulty: questionData.difficulty,
        tags: questionData.tags,
        points: questionData.points,
        // Remove campos desnecessários
        institution: null,
        language: 'pt',
      };

      const { error } = await supabase
        .from('questions')
        .update(updateData as any)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Questão atualizada com sucesso.",
      });

      // Permanece na página de edição após salvar
    } catch (error) {
      console.error('Erro ao atualizar questão:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a questão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/questions">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Editar Questão</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {loading || !initialData ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-1/3" />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
              <div className="space-y-6">
                <Skeleton className="h-96 w-full" />
              </div>
            </div>
          </div>
        ) : (
          <QuestionEditor onSave={handleUpdate} initialData={initialData as any} loading={loading} />
        )}
      </main>
    </div>
  );
}