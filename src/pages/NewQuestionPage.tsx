// src/pages/NewQuestionPage.tsx

import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { QuestionEditor } from '@/components/QuestionEditor';
import { ArrowLeft } from 'lucide-react'; // Importa o ícone

export default function NewQuestionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Função para tratar o correct_answer baseado no tipo da questão
  const getCorrectAnswerForType = (questionData: any) => {
    switch (questionData.type) {
      case 'multiple_choice':
        return questionData.options.filter((opt: any) => opt.isCorrect).map((opt: any) => opt.id);
      case 'true_false':
        return questionData.correctAnswer; // boolean ou string 'true'/'false'
      case 'essay':
        return questionData.correctAnswer || ''; // string com critérios ou resposta esperada
      default:
        return null;
    }
  };

  const handleSave = async (questionData: any) => {
    if (!user) return;

    // Preparar dados para o banco
    const dataToInsert = {
      title: questionData.title,
      content: questionData.content,
      type: questionData.type,
      options: questionData.type === 'multiple_choice' ? questionData.options.map(({ id, text }) => ({ id, text })) : null,
      correct_answer: getCorrectAnswerForType(questionData),
      category: questionData.category || null,
      subject: questionData.subject,
      difficulty: questionData.difficulty,
      tags: questionData.tags,
      points: questionData.points,
      author_id: user.id
    };

    console.log('Dados a serem inseridos:', dataToInsert);

    const { data, error } = await supabase
      .from('questions')
      .insert(dataToInsert)
      .select()
      .single();

    if (error) {
      toast({
        title: "Erro ao salvar questão",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso!",
        description: "A nova questão foi salva.",
      });
      navigate(`/questions/${data.id}/edit`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            {/* BOTÃO ADICIONADO AQUI */}
            <Link to="/questions">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Criar Nova Questão</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <QuestionEditor onSave={handleSave} />
      </main>
    </div>
  );
}