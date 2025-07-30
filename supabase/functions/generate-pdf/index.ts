import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function generateExamHTML(exam: any, header: any, questions: any[], version: number, includeAnswers: boolean): string {
  const qrData = exam.qr_code_data || `exam:${exam.id}:v${version}`;
  
  // Usando os dados do cabeçalho se existirem, senão fallback para os dados da prova
  const institutionName = header?.institution || exam.institution || 'Instituição de Ensino';
  const examTitle = header?.content?.title || exam.title;
  const professorName = header?.content?.professor || '_________________________';
  const courseName = header?.content?.course || '_________________________';
  const className = header?.content?.class || '_________________________';
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${exam.title} - Versão ${version}</title>
    <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; margin: 0; padding: 2cm; color: #000; width: 210mm; min-height: 297mm; box-sizing: border-box; }
        .page { width: 100%; height: 100%; }
        .header-grid { display: grid; grid-template-columns: 1fr 3fr 1fr; gap: 20px; align-items: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
        .logo { max-height: 80px; max-width: 100%; object-fit: contain; justify-self: center; }
        .header-info { text-align: center; }
        .header-info h1 { font-size: 16pt; margin: 0; font-weight: bold; }
        .header-info h2 { font-size: 14pt; margin: 5px 0; font-weight: normal; }
        .grade-box { border: 1px solid #000; padding: 10px; text-align: center; height: fit-content; }
        .details-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .details-table td { border: 1px solid #000; padding: 6px; font-size: 11pt; }
        .question { margin-bottom: 25px; page-break-inside: avoid; }
        .question-header { font-weight: bold; margin-bottom: 10px; }
        .question-content { margin-bottom: 15px; text-align: justify; }
        .options { list-style-type: none; padding-left: 5px; }
        .option { margin-bottom: 8px; display: flex; align-items: flex-start; }
        .option-letter { font-weight: bold; margin-right: 8px; min-width: 20px; }
        .correct-answer { background-color: #d4edda !important; }
        @media print { body { padding: 1.5cm; } }
    </style>
</head>
<body>
    <div class="page">
        <div class="header-grid">
            ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo" class="logo">` : '<div></div>'}
            <div class="header-info">
                <h1>${institutionName}</h1>
                <h2>${examTitle}</h2>
            </div>
            <div class="grade-box"><strong>Nota</strong></div>
        </div>
        <table class="details-table">
            <tr>
                <td><strong>Professor:</strong> ${professorName}</td>
                <td><strong>Disciplina:</strong> ${exam.subject}</td>
            </tr>
            <tr>
                <td><strong>Aluno:</strong></td>
                <td><strong>Data:</strong> ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '__/__/____'}</td>
            </tr>
            <tr>
                <td><strong>Curso:</strong> ${courseName}</td>
                <td><strong>Turma:</strong> ${className}</td>
            </tr>
        </table>
        
        <div class="questions">
            ${questions.map((question, index) => `
                <div class="question">
                    <div class="question-header">Questão ${index + 1} (${question.points} ${question.points === 1 ? 'ponto' : 'pontos'})</div>
                    <div class="question-content">${typeof question.content === 'string' ? question.content : JSON.stringify(question.content)}</div>
                    ${question.type === 'multiple_choice' && question.options ? `
                        <ol class="options" type="A">
                            ${(question.options as any[]).map((option: any, optIndex: number) => `
                                <li class="option ${includeAnswers && question.correct_answer.includes(option.id) ? 'correct-answer' : ''}">
                                    <span class="option-text">${option.text}</span>
                                </li>
                            `).join('')}
                        </ol>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { examId, version = 1, includeAnswers = false } = await req.json();
    if (!examId) throw new Error("examId é obrigatório");

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (examError || !exam) throw new Error(`Prova não encontrada: ${examError?.message}`);

    let header = null;
    if (exam.header_id) {
      const { data: headerData, error: headerError } = await supabase
        .from('exam_headers')
        .select('*')
        .eq('id', exam.header_id)
        .single();
      if (headerError) console.warn(`Cabeçalho ${exam.header_id} não encontrado.`);
      else header = headerData;
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .in('id', exam.question_ids);

    if (questionsError || !questions) throw new Error(`Questões não encontradas: ${questionsError?.message}`);
    
    let orderedQuestions = [...questions];
    if (exam.shuffle_questions && version > 1) {
      orderedQuestions = shuffleArray(questions, version);
    }
    if (exam.shuffle_options && version > 1) {
      orderedQuestions = orderedQuestions.map(q => ({
        ...q,
        options: q.options ? shuffleArray(q.options, version * 100 + parseInt(q.id.slice(-4), 16)) : q.options
      }));
    }
    
    const html = generateExamHTML(exam, header, orderedQuestions, version, includeAnswers);

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});