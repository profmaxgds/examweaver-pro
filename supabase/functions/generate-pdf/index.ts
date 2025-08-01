// supabase/functions/generate-pdf/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Módulos que você já usa (assumindo que estão na mesma pasta)
import { fetchExamData as fetchVersionExamData } from './data-fetcher.ts';
import { generateExamHTML } from './layout.ts';
import { shuffleArray } from './utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// NOVA FUNÇÃO para buscar os dados de uma prova já preparada
async function fetchPreparedExamData(supabase: SupabaseClient, studentExamId: string) {
    const { data, error } = await supabase
        .from('student_exams')
        .select(`
            id,
            shuffled_question_ids,
            shuffled_options_map,
            exam:exams(*),
            student:students(*, class:classes(name))
        `)
        .eq('id', studentExamId)
        .single();
    if (error) throw new Error(`Prova preparada não encontrada: ${error.message}`);
    
    // Buscar o cabeçalho separadamente se existir
    if (data.exam.header_id) {
        const { data: headerData, error: headerError } = await supabase
            .from('exam_headers')
            .select('*')
            .eq('id', data.exam.header_id)
            .single();
        
        if (!headerError && headerData) {
            data.exam.header = headerData;
        }
    }
    
    const { data: qData, error: qError } = await supabase
        .from('questions')
        .select('*')
        .in('id', data.shuffled_question_ids);
    if (qError) throw qError;

    const questionMap = new Map(qData.map(q => [q.id, q]));
    const orderedQuestions = data.shuffled_question_ids.map((id: string) => questionMap.get(id));

    const finalQuestions = orderedQuestions.map((q: any) => {
        if (q && q.type === 'multiple_choice' && data.shuffled_options_map[q.id]) {
            const optionMap = new Map(q.options.map((opt: any) => [opt.id, opt]));
            return { ...q, options: data.shuffled_options_map[q.id].map((optId: string) => optionMap.get(optId)) };
        }
        return q;
    }).filter(Boolean);

    return { preparedExamData: data, questions: finalQuestions };
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { examId, version = 1, includeAnswers = false, studentExamId, generatePDF = false } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    let html: string;
    let examTitle: string;
    
    // ROTA 1: Geração por Turma (a prova já foi preparada)
    if (studentExamId) {
        console.log('Iniciando geração por ALUNO:', studentExamId);
        const { preparedExamData, questions } = await fetchPreparedExamData(supabase, studentExamId);
        
        const studentInfo = {
            name: preparedExamData.student?.name || 'N/A',
            id: preparedExamData.student?.student_id || 'N/A',
            course: preparedExamData.student?.course || 'N/A',
            class: preparedExamData.student?.class?.name || 'N/A',
            qrId: preparedExamData.id 
        };
        
        html = generateExamHTML(preparedExamData.exam, questions, version, includeAnswers, studentInfo);
        examTitle = preparedExamData.exam.title;

    // ROTA 2: Geração por Versão (seu código original)
    } else if (examId) {
        console.log('Iniciando geração por VERSÃO:', examId, ' v', version);
        const { exam, questions } = await fetchVersionExamData(supabase, examId);

        const originalOrderMap = new Map(exam.question_ids.map((id: string, index: number) => [id, index]));
        let processedQuestions = [...questions].sort((a, b) => (originalOrderMap.get(a.id) ?? Infinity) - (originalOrderMap.get(b.id) ?? Infinity));

        if (exam.shuffle_questions) { // Embaralha para todas as versões
            processedQuestions = shuffleArray(processedQuestions, version);
        }
        if (exam.shuffle_options) {
            processedQuestions = processedQuestions.map(q => ({
                ...q,
                options: q.options && Array.isArray(q.options)
                    ? shuffleArray(q.options, (version * 100) + parseInt(q.id.slice(-4), 16))
                    : q.options
            }));
        }
        
        html = generateExamHTML(exam, processedQuestions, version, includeAnswers);
        examTitle = exam.title;

    } else {
        throw new Error("Parâmetros inválidos. Forneça 'studentExamId' ou 'examId'.");
    }

    // Se solicitado PDF, gerar PDF 
    if (generatePDF) {
      console.log('Gerando PDF da prova...');
      
      try {
        // Usar uma abordagem simples: retornar o HTML com headers específicos para PDF
        // O navegador/cliente irá lidar com a conversão
        return new Response(html, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/html',
            'Content-Disposition': `inline; filename="${examTitle.replace(/\s+/g, '_')}_v${version}.html"`,
            'X-PDF-Conversion': 'true'
          },
        });
      } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        return new Response(JSON.stringify({ 
          error: `Erro ao gerar PDF: ${error.message}`,
          html, 
          examTitle, 
          version
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ html, examTitle, version }), {
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