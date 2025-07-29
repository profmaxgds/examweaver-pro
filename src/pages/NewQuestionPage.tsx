import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { QuestionEditor } from '@/components/QuestionEditor';
import { useToast } from '@/hooks/use-toast';

export default function NewQuestionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSave = async (questionData: any) => {
    if (!user) return;

    setLoading(true);
    try {
      // Preparar dados para inserção
      const insertData = {
        author_id: user.id,
        title: questionData.title,
        content: questionData.content,
        type: questionData.type,
        options: questionData.type === 'multiple_choice' ? questionData.options : null,
        correct_answer: questionData.type === 'multiple_choice' 
          ? questionData.options.filter((opt: any) => opt.isCorrect).map((opt: any) => opt.id)
          : questionData.correctAnswer,
        category: questionData.category || null,
        subject: questionData.subject,
        institution: questionData.institution || null,
        difficulty: questionData.difficulty,
        tags: questionData.tags,
        points: questionData.points,
        language: questionData.language,
        image_urls: [], // TODO: Implementar upload de imagens
        audio_urls: [], // TODO: Implementar upload de áudio
      };

      const { data, error } = await supabase
        .from('questions')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Questão criada com sucesso.",
      });

      navigate('/questions');
    } catch (error) {
      console.error('Erro ao salvar questão:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a questão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return <QuestionEditor onSave={handleSave} loading={loading} />;
}