// supabase/functions/generate-pdf/data-fetcher.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

/**
 * Busca todos os dados necessários para uma prova, incluindo o exame principal,
 * as questões associadas e o cabeçalho personalizado (se existir).
 * @param supabase O cliente Supabase.
 * @param examId O ID da prova a ser buscada.
 * @returns Um objeto contendo os dados do exame e suas questões.
 */
export async function fetchExamData(supabase: any, examId: string) {
  console.log('Iniciando busca dos dados para exam:', examId);
  
  try {
    // 1. Busca a prova (sem usar maybeSingle() para evitar problemas)
    const { data: examData, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId);

    if (examError) {
      console.error('Erro ao buscar exame:', examError);
      throw new Error(`Erro ao buscar a prova: ${examError.message}`);
    }
    
    if (!examData || examData.length === 0) {
      console.error('Exame não encontrado');
      throw new Error(`Prova com ID ${examId} não encontrada.`);
    }

    const exam = examData[0];
    console.log('Exame encontrado:', exam.title, 'Header ID:', exam.header_id);

    // 2. Busca o cabeçalho se existir
    let examHeader = null;
    if (exam.header_id) {
      console.log('Buscando cabeçalho:', exam.header_id);
      const { data: headerData, error: headerError } = await supabase
        .from('exam_headers')
        .select('*')
        .eq('id', exam.header_id);
      
      if (!headerError && headerData && headerData.length > 0) {
        examHeader = headerData[0];
        console.log('Cabeçalho encontrado:', examHeader.name);
      } else {
        console.log('Cabeçalho não encontrado ou erro:', headerError?.message);
      }
    }

    // 3. Busca as questões da prova
    console.log('Buscando questões:', exam.question_ids);
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .in('id', exam.question_ids || []);

    if (questionsError) {
      console.error('Erro ao buscar questões:', questionsError);
      throw new Error(`Erro ao buscar as questões: ${questionsError.message}`);
    }
    
    if (!questions || questions.length === 0) {
      console.error('Nenhuma questão encontrada');
      throw new Error('As questões para esta prova não foram encontradas.');
    }

    console.log(`${questions.length} questões encontradas`);

    // Monta o objeto final com o cabeçalho
    const examWithHeader = {
      ...exam,
      exam_headers: examHeader
    };

    console.log('Dados preparados com sucesso');
    return { exam: examWithHeader, questions };
    
  } catch (error) {
    console.error('Erro detalhado ao buscar dados:', error);
    throw error;
  }
}