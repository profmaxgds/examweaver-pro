import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Buscar dados da prova com o cabeçalho relacionado
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select(`
        *,
        exam_headers (*)
      `)
      .eq('id', examId)
      .single();

    if (examError || !exam) {
      throw new Error('Exam not found');
    }

    // Buscar questões
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .in('id', exam.question_ids);

    if (questionsError || !questions) {
      throw new Error('Questions not found');
    }

    // Embaralhar questões se necessário
    let orderedQuestions = [...questions];
    if (exam.shuffle_questions && version > 1) {
      orderedQuestions = shuffleArray(questions, version);
    }

    // Embaralhar opções se necessário
    if (exam.shuffle_options && version > 1) {
      orderedQuestions = orderedQuestions.map(q => ({
        ...q,
        options: q.options ? shuffleArray(q.options, version * 100 + parseInt(q.id.slice(-4), 16)) : q.options
      }));
    }

    // Gerar HTML da prova
    const html = generateExamHTML(exam, orderedQuestions, version, includeAnswers);

    return new Response(
      JSON.stringify({
        html,
        examTitle: exam.title,
        version
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error generating PDF:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function shuffleArray<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let m = arr.length;
  
  let random = seed;
  const next = () => {
    random = (random * 1664525 + 1013904223) % Math.pow(2, 32);
    return random / Math.pow(2, 32);
  };

  while (m) {
    const i = Math.floor(next() * m--);
    [arr[m], arr[i]] = [arr[i], arr[m]];
  }
  
  return arr;
}

function generateExamHTML(exam: any, questions: any[], version: number, includeAnswers: boolean): string {
  const header = exam.exam_headers;
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${exam.title} - Versão ${version}</title>
    <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; margin: 2cm; color: #000; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 25px; }
        .header h1 { font-size: 18pt; margin: 0; font-weight: bold; }
        .header h2 { font-size: 14pt; margin: 5px 0; font-weight: normal; }
        .exam-info { display: flex; justify-content: space-between; margin: 20px 0; font-size: 11pt; }
        .instructions { margin-bottom: 20px; text-align: justify; font-size: 11pt; }
        .student-info { border: 2px solid #000; padding: 15px; margin-bottom: 20px; }
        .student-field { margin-bottom: 10px; border-bottom: 1px solid #000; padding-bottom: 5px; }
        .question { margin-bottom: 25px; page-break-inside: avoid; }
        .question-header { font-weight: bold; margin-bottom: 10px; }
        .question-content { margin-bottom: 15px; text-align: justify; }
        .options { list-style-type: none; padding-left: 20px; }
        .option { margin-bottom: 8px; }
        .correct-answer { background-color: #e8f5e8 !important; font-weight: bold; }
        @media print { body { margin: 1.5cm; } .page-break { page-break-before: always; } }
    </style>
</head>
<body>
    <div class="header">
        ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo" style="max-height: 60px; margin-bottom: 10px;">` : ''}
        <h1>${header?.institution || exam.institution || 'Instituição'}</h1>
        <h2>${exam.title}</h2>
    </div>
    <div class="exam-info">
        <div>
            <strong>Disciplina:</strong> ${exam.subject}<br>
            <strong>Data:</strong> ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/___'}<br>
            ${exam.time_limit ? `<strong>Tempo:</strong> ${exam.time_limit} minutos<br>` : ''}
        </div>
        <div>
            <strong>Versão:</strong> ${version}<br>
            <strong>Total de Pontos:</strong> ${exam.total_points}<br>
            <strong>Questões:</strong> ${questions.length}
        </div>
    </div>
    ${exam.instructions ? `<div class="instructions"><strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}</div>` : ''}
    <div class="student-info">
        <div class="student-field"><strong>Nome:</strong> _________________________________________________</div>
        <div class="student-field"><strong>Matrícula:</strong> _________________________________________________</div>
    </div>
    <div class="questions">
        ${questions.map((question, index) => `
            <div class="question">
                <div class="question-header">
                    Questão ${index + 1} (${question.points} ${question.points === 1 ? 'ponto' : 'pontos'})
                </div>
                <div class="question-content">
                    ${typeof question.content === 'string' ? question.content : JSON.stringify(question.content)}
                </div>
                ${question.type === 'multiple_choice' && Array.isArray(question.options) ? `
                    <ol type="A" class="options">
                        ${question.options.map((option: any) => `
                            <li class="option ${includeAnswers && Array.isArray(question.correct_answer) && question.correct_answer.includes(option.id) ? 'correct-answer' : ''}">
                                ${option.text}
                            </li>
                        `).join('')}
                    </ol>
                ` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>`;
}