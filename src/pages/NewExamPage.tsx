import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/use-toast'; // Verifique se o caminho do seu hook de toast está correto

// Este componente agora lida com a criação de uma nova prova e redireciona para a página de edição.
export default function NewExamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const createNewExamAndRedirect = async () => {
      if (!user) {
        toast({ title: "Erro de Autenticação", description: "Você precisa estar logado para criar uma prova.", variant: "destructive" });
        navigate('/auth');
        return;
      }

      try {
        // 1. Insere um rascunho de prova no banco de dados com valores padrão.
        const { data, error } = await supabase
          .from('exams')
          .insert({
            author_id: user.id,
            title: 'Nova Prova (Rascunho)',
            subject: 'Defina a matéria',
            total_points: 0,
            question_ids: [],
            // Adicione outros campos padrão que sua tabela 'exams' possa exigir
            layout: 'single_column',
            versions: 1,
            shuffle_questions: false,
            shuffle_options: false,
          })
          .select()
          .single();

        if (error) throw error;

        // 2. Redireciona para a página de edição com o ID da nova prova.
        toast({ title: "Rascunho criado!", description: "Você já pode começar a editar sua nova prova." });
        navigate(`/exams/${data.id}/edit`);

      } catch (error: any) {
        console.error("Erro ao criar nova prova:", error);
        toast({
          title: "Falha ao Criar Prova",
          description: `Não foi possível criar um rascunho. Tente novamente. Erro: ${error.message}`,
          variant: "destructive",
        });
        navigate('/exams'); // Volta para a lista de provas em caso de erro.
      }
    };

    createNewExamAndRedirect();
  }, [user, navigate, toast]);

  // Renderiza um indicador de carregamento enquanto o processo de criação e redirecionamento acontece.
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary mx-auto"></div>
        <p className="mt-6 text-lg text-muted-foreground">Preparando sua nova prova...</p>
      </div>
    </div>
  );
}