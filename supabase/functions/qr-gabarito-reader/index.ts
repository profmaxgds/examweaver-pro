import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para extrair informações do HTML do gabarito usando regex
function extractGabaritoFromHTML(htmlContent: string) {
  try {
    const gabarito: any = {};
    
    // Extrair coordenadas dos bubbles corretos
    const bubbleRegex = /<div class="bubble correct-answer"[^>]*data-question="(\d+)"[^>]*data-option="([A-E])"[^>]*>/g;
    let match;
    
    while ((match = bubbleRegex.exec(htmlContent)) !== null) {
      const questionNum = parseInt(match[1]);
      const option = match[2];
      gabarito[`q${questionNum}`] = {
        correct_option: option,
        type: 'multiple_choice'
      };
    }
    
    // Extrair questões dissertativas
    const essayRegex = /<span class="essay-indicator">Dissertativa<\/span>/g;
    const essayMatches = htmlContent.match(essayRegex);
    if (essayMatches) {
      // Contar questões para identificar quais são dissertativas
      const questionNumbers = htmlContent.match(/q-number">(\d+)\.<\/span>/g);
      if (questionNumbers) {
        let essayCount = 0;
        questionNumbers.forEach((qNum, index) => {
          const num = qNum.match(/(\d+)/)?.[1];
          if (num) {
            const nextElement = htmlContent.substring(
              htmlContent.indexOf(qNum) + qNum.length,
              htmlContent.indexOf(qNum) + qNum.length + 100
            );
            if (nextElement.includes('essay-indicator')) {
              gabarito[`q${num}`] = {
                type: 'essay',
                correct_option: null
              };
            }
          }
        });
      }
    }
    
    // Extrair coordenadas dos bubbles para correção
    const bubbleCoordRegex = /<div class="bubble[^"]*"[^>]*data-question="(\d+)"[^>]*data-option="([A-E])"[^>]*>/g;
    const coordinates: any = {};
    
    while ((match = bubbleCoordRegex.exec(htmlContent)) !== null) {
      const questionNum = parseInt(match[1]);
      const option = match[2];
      
      if (!coordinates[`q${questionNum}`]) {
        coordinates[`q${questionNum}`] = { bubbles: {} };
      }
      
      // Simular coordenadas baseadas na posição no HTML
      // Em uma implementação real, você extrairia do CSS ou calcularia
      const baseX = 249 + (option.charCodeAt(0) - 65) * 16; // A=249, B=265, etc
      const baseY = 227 + (questionNum - 1) * 19; // Cada linha tem ~19px
      
      coordinates[`q${questionNum}`].bubbles[option] = {
        x: baseX,
        y: baseY,
        w: 13,
        h: 13
      };
    }
    
    return {
      answers: gabarito,
      coordinates: coordinates,
      total_questions: Object.keys(gabarito).length
    };
    
  } catch (error) {
    console.error('Erro ao extrair gabarito do HTML:', error);
    throw new Error(`Erro ao processar gabarito: ${error.message}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { qrData } = await req.json();
    
    if (!qrData) {
      return new Response(
        JSON.stringify({ error: 'QR code data is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse QR code data
    let qrInfo;
    try {
      qrInfo = JSON.parse(qrData);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid QR code format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { examId, studentExamId, studentId } = qrInfo;
    
    if (!examId || !studentExamId) {
      return new Response(
        JSON.stringify({ error: 'Missing required QR code information' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar o gabarito HTML da nova tabela
    const { data: gabaritoFile, error: gabaritoError } = await supabase
      .from('exam_generated_files')
      .select('*')
      .eq('student_exam_id', studentExamId)
      .eq('file_type', 'answer_key_html')
      .single();

    if (gabaritoError || !gabaritoFile) {
      console.error('Erro ao buscar gabarito:', gabaritoError);
      return new Response(
        JSON.stringify({ error: 'Gabarito não encontrado para esta prova' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Buscar informações do exame
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('title, subject, total_points')
      .eq('id', examId)
      .single();

    if (examError) {
      console.error('Erro ao buscar exame:', examError);
    }

    // Extrair gabarito do HTML
    const gabaritoData = extractGabaritoFromHTML(gabaritoFile.content);

    console.log(`Gabarito extraído para ${gabaritoFile.student_name}: ${gabaritoData.total_questions} questões`);

    return new Response(
      JSON.stringify({
        success: true,
        exam: {
          id: examId,
          title: exam?.title || 'Prova',
          subject: exam?.subject || 'Disciplina',
          total_points: exam?.total_points || 100
        },
        student: {
          name: gabaritoFile.student_name,
          student_id: gabaritoFile.student_id,
          student_exam_id: studentExamId
        },
        gabarito: gabaritoData.answers,
        coordinates: gabaritoData.coordinates,
        total_questions: gabaritoData.total_questions,
        html_content: gabaritoFile.content
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Erro no qr-gabarito-reader:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});