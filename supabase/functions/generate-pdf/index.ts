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
    console.log('Iniciando geração de PDF...');
    const { examId, version = 1, includeAnswers = false } = await req.json();
    console.log('Parâmetros recebidos:', { examId, version, includeAnswers });

    if (!examId) {
      throw new Error("O ID da prova é obrigatório.");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('URLs Supabase:', { url: supabaseUrl ? 'definida' : 'não definida', key: supabaseKey ? 'definida' : 'não definida' });

    const supabase = createClient(
      supabaseUrl ?? '',
      supabaseKey ?? ''
    );
    
    // 1. Busca os dados usando o módulo separado
    console.log('Buscando dados do exame...');
    const { exam, questions } = await fetchExamData(supabase, examId);

    // 2. Prepara os dados (ordenação e embaralhamento)
    console.log('Preparando questões para versão:', version);
    const originalOrderMap = new Map(exam.question_ids.map((id: string, index: number) => [id, index]));
    let processedQuestions = [...questions].sort((a, b) => (originalOrderMap.get(a.id) ?? Infinity) - (originalOrderMap.get(b.id) ?? Infinity));

    if (exam.shuffle_questions && version > 1) {
        console.log('Embaralhando questões...');
        processedQuestions = shuffleArray(processedQuestions, version);
    }
    if (exam.shuffle_options && version > 1) {
        console.log('Embaralhando opções...');
        processedQuestions = processedQuestions.map(q => ({
            ...q,
            options: q.options && Array.isArray(q.options)
                ? shuffleArray(q.options, (version * 100) + parseInt(q.id.slice(-4), 16))
                : q.options
        }));
    }

    // 3. Gera o HTML usando o módulo de layout
    console.log('Gerando HTML da prova...');
    const html = generateExamHTML(exam, processedQuestions, version, includeAnswers);
    console.log('HTML gerado com sucesso, tamanho:', html.length, 'caracteres');

    // 4. Gera o PDF real
    console.log('Convertendo HTML para PDF...');
    const pdfResponse = await fetch('https://chrome-api.browserless.io/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        html: html,
        options: {
          format: 'A4',
          printBackground: true,
          margin: {
            top: '1cm',
            right: '1cm', 
            bottom: '1cm',
            left: '1cm'
          },
          displayHeaderFooter: false,
          preferCSSPageSize: true
        }
      })
    });

    if (!pdfResponse.ok) {
      console.error('Erro na conversão PDF:', pdfResponse.statusText);
      // Fallback para HTML se PDF falhar
      return new Response(JSON.stringify({ html, examTitle: exam.title, version }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log('PDF gerado com sucesso, tamanho:', pdfBuffer.byteLength, 'bytes');

    // 5. Retorna o PDF
    return new Response(pdfBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${exam.title}-v${version}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString()
      },
    });

  } catch (error) {
    console.error('Erro detalhado ao gerar prova:', error);
    return new Response(JSON.stringify({ error: `Erro interno no servidor: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});