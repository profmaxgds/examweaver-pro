// supabase/functions/generate-pdf/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { fetchExamData } from './data-fetcher.ts';
import { generateExamHTML } from './layout.ts';
import { shuffleArray } from './utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { examId, version = 1, includeAnswers = false } = await req.json();

    if (!examId) {
      throw new Error("O ID da prova é obrigatório.");
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    
    // 1. Busca os dados usando o módulo separado
    const { exam, questions } = await fetchExamData(supabase, examId);

    // 2. Prepara os dados (ordenação e embaralhamento)
    const originalOrderMap = new Map(exam.question_ids.map((id: string, index: number) => [id, index]));
    let processedQuestions = [...questions].sort((a, b) => (originalOrderMap.get(a.id) ?? Infinity) - (originalOrderMap.get(b.id) ?? Infinity));

    if (exam.shuffle_questions && version > 1) {
        processedQuestions = shuffleArray(processedQuestions, version);
    }
    if (exam.shuffle_options && version > 1) {
        processedQuestions = processedQuestions.map(q => ({
            ...q,
            options: q.options && Array.isArray(q.options)
                ? shuffleArray(q.options, (version * 100) + parseInt(q.id.slice(-4), 16))
                : q.options
        }));
    }

    // 3. Gera o HTML usando o módulo de layout
    const html = generateExamHTML(exam, processedQuestions, version, includeAnswers);

    // 4. Retorna a resposta
    return new Response(JSON.stringify({ html, examTitle: exam.title, version }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro detalhado ao gerar prova:', error);
    return new Response(JSON.stringify({ error: `Erro interno no servidor: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});