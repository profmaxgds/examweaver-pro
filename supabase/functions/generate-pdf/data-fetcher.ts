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
  // 1. Busca a prova e, se houver, o cabeçalho associado via header_id
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('*, exam_headers(*)') // Junta os dados do cabeçalho
    .eq('id', examId)
    .single();

  if (examError) throw new Error(`Erro ao buscar a prova: ${examError.message}`);
  if (!exam) throw new Error(`Prova com ID ${examId} não encontrada.`);

  // 2. Busca as questões da prova
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('*')
    .in('id', exam.question_ids);

  if (questionsError) throw new Error(`Erro ao buscar as questões: ${questionsError.message}`);
  if (!questions || questions.length === 0) throw new Error('As questões para esta prova não foram encontradas.');

  return { exam, questions };
}