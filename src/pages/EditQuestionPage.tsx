import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { QuestionEditor } from '@/components/QuestionEditor';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

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
  institution: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'custom';
  tags: string[];
  points: number;
  language: string;
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
          institution: data.institution || '',
          difficulty: data.difficulty,
          tags: data.tags || [],
          points: data.points,
          language: data.language || 'pt',
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
        options: questionData.type === 'multiple_choice' ? questionData.options : null,
        correct_answer: questionData.type === 'multiple_choice'
          ? questionData.options.filter(opt => opt.isCorrect).map(opt => opt.id)
          : questionData.correctAnswer,
        category: questionData.category || null,
        subject: questionData.subject,
        institution: questionData.institution || null,
        difficulty: questionData.difficulty,
        tags: questionData.tags,
        points: questionData.points,
        language: questionData.language,
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

      navigate('/questions');
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

  if (loading || !initialData) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
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
    );
  }

  return <QuestionEditor onSave={handleUpdate} initialData={initialData as any} loading={loading} />;
}