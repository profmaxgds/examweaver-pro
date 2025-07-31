import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função auxiliar para embaralhar arrays
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

// Função para gerar o HTML da prova
function generateExamHTML(exam: any, header: any, questions: any[], version: number, includeAnswers: boolean): string {
    const isDoubleColumn = exam.layout === 'double_column';

    const styles = `
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; margin: 2cm; color: #333; }
        .page-container { max-width: 18cm; margin: auto; }
        .header { text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 15px; margin-bottom: 25px; }
        .header img { max-height: 60px; margin-bottom: 10px; }
        .header h1 { font-size: 16pt; margin: 0; font-weight: bold; }
        .header h2 { font-size: 14pt; margin: 5px 0; font-weight: normal; color: #555; }
        .exam-info { display: flex; justify-content: space-between; margin: 20px 0; font-size: 11pt; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
        .student-info { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 10px 0; margin-bottom: 25px; }
        .student-field { margin-bottom: 8px; }
        .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; }
        .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
        .question { margin-bottom: 20px; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
        .question-header { font-weight: bold; margin-bottom: 8px; }
        .question-content { margin-bottom: 12px; text-align: justify; }
        .question-content p { margin: 0 0 8px 0; }
        .options { list-style-type: none; padding-left: 0; }
        .option { margin-bottom: 6px; display: flex; align-items: flex-start; }
        .option-letter { font-weight: bold; margin-right: 8px; }
        .correct-answer { background-color: #d4edda; border-radius: 4px; padding: 2px 5px; }
    `;

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${exam.title} - V${version}</title>
        <style>${styles}</style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo">` : ''}
                <h1>${header?.institution || exam.institution || 'Instituição de Ensino'}</h1>
                <h2>${exam.title}</h2>
            </div>
            <div class="exam-info">
                <div><strong>Disciplina:</strong> ${exam.subject}</div>
                <div><strong>Data:</strong> ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/___'}</div>
                <div><strong>Versão:</strong> ${version}</div>
            </div>
            <div class="student-info">
                <div class="student-field"><strong>Aluno:</strong> _________________________________________________________</div>
                <div class="student-field"><strong>Matrícula:</strong> ____________________</div>
            </div>
            ${exam.instructions ? `<div class="instructions"><strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}</div>` : ''}

            <div class="questions-container">
                ${questions.map((q, index) => `
                    <div class="question">
                        <div class="question-header">Questão ${index + 1} (${q.points} pts)</div>
                        <div class="question-content">${typeof q.content === 'string' ? q.content : JSON.stringify(q.content)}</div>
                        ${q.type === 'multiple_choice' && Array.isArray(q.options) ? `
                            <ol class="options">
                                ${q.options.map((opt: any, optIndex: number) => `
                                    <li class="option ${includeAnswers && Array.isArray(q.correct_answer) && q.correct_answer.includes(opt.id) ? 'correct-answer' : ''}">
                                        <span class="option-letter">${String.fromCharCode(65 + optIndex)})</span>
                                        <div>${opt.text}</div>
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { examId, version = 1, includeAnswers = false } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    
    // **CORREÇÃO DEFINITIVA:**
    // Passo 1: Buscar a prova.
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select(`*`)
      .eq('id', examId)
      .single();

    if (examError) throw examError;
    if (!exam) throw new Error('Prova não encontrada');

    // Passo 2: Buscar o cabeçalho separadamente, SE existir um header_id.
    let header = null;
    if (exam.header_id) {
        const { data: headerData, error: headerError } = await supabase
            .from('exam_headers')
            .select('*')
            .eq('id', exam.header_id)
            .single();
        if (headerError) console.error("Erro ao buscar cabeçalho:", headerError.message);
        else header = headerData;
    }

    // Passo 3: Buscar as questões.
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .in('id', exam.question_ids);

    if (questionsError) throw questionsError;
    if (!questions) throw new Error('Questões não encontradas');

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

    return new Response(JSON.stringify({ html, examTitle: exam.title, version }), {
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