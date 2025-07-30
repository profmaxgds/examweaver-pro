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

    // Buscar dados da prova
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
      // Usar versão como seed para embaralhamento consistente
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
  
  // Simples LCG (Linear Congruential Generator) para seed determinístico
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
  const header = exam.exam_headers?.[0];
  const qrData = exam.qr_code_data || `exam:${exam.id}:v${version}`;
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${exam.title} - Versão ${version}</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            font-size: 12pt;
            line-height: 1.4;
            margin: 0;
            padding: 20px;
            color: #000;
        }
        
        .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 18pt;
            margin: 0;
            font-weight: bold;
        }
        
        .header h2 {
            font-size: 14pt;
            margin: 5px 0;
            font-weight: normal;
        }
        
        .exam-info {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
            font-size: 11pt;
        }
        
        .qr-code {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 80px;
            height: 80px;
            border: 1px solid #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8pt;
        }
        
        .question {
            margin-bottom: 25px;
            page-break-inside: avoid;
        }
        
        .question-header {
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .question-content {
            margin-bottom: 15px;
            text-align: justify;
        }
        
        .options {
            margin-left: 20px;
        }
        
        .option {
            margin-bottom: 8px;
            display: flex;
            align-items: flex-start;
        }
        
        .option-letter {
            font-weight: bold;
            margin-right: 8px;
            min-width: 20px;
        }
        
        .option-text {
            flex: 1;
        }
        
        .answer-sheet {
            page-break-before: always;
            margin-top: 50px;
        }
        
        .answer-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-top: 20px;
        }
        
        .answer-item {
            border: 1px solid #000;
            padding: 10px;
            text-align: center;
        }
        
        .student-info {
            border: 2px solid #000;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .student-field {
            margin-bottom: 10px;
            border-bottom: 1px solid #000;
            padding-bottom: 5px;
        }
        
        @media print {
            body { margin: 0; padding: 15px; }
            .page-break { page-break-before: always; }
        }
        
        .correct-answer {
            background-color: #e8f5e8 !important;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="qr-code">
        QR: ${qrData}
    </div>
    
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
    
    <div class="student-info">
        <div class="student-field"><strong>Nome:</strong> _________________________________________________</div>
        <div class="student-field"><strong>Matrícula:</strong> _________________________________________________</div>
        <div class="student-field"><strong>Assinatura:</strong> _________________________________________________</div>
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
                
                ${question.type === 'multiple_choice' && question.options ? `
                    <div class="options">
                        ${question.options.map((option: any, optIndex: number) => `
                            <div class="option ${includeAnswers && option.isCorrect ? 'correct-answer' : ''}">
                                <span class="option-letter">${String.fromCharCode(65 + optIndex)})</span>
                                <span class="option-text">${option.text}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${question.type === 'true_false' ? `
                    <div class="options">
                        <div class="option ${includeAnswers && question.correct_answer === true ? 'correct-answer' : ''}">
                            <span class="option-letter">( )</span>
                            <span class="option-text">Verdadeiro</span>
                        </div>
                        <div class="option ${includeAnswers && question.correct_answer === false ? 'correct-answer' : ''}">
                            <span class="option-letter">( )</span>
                            <span class="option-text">Falso</span>
                        </div>
                    </div>
                ` : ''}
                
                ${question.type === 'essay' ? `
                    <div style="border: 1px solid #ccc; min-height: 100px; margin-top: 10px;"></div>
                ` : ''}
            </div>
        `).join('')}
    </div>
    
    ${exam.answer_sheet?.position !== 'none' ? `
        <div class="answer-sheet page-break">
            <h2>Folha de Respostas</h2>
            <div class="answer-grid">
                ${questions.map((_, index) => `
                    <div class="answer-item">
                        <strong>${index + 1}</strong><br>
                        ${Array.from({length: 5}, (_, i) => 
                            `<span style="margin: 0 3px;">${String.fromCharCode(65 + i)} ( )</span>`
                        ).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    ` : ''}
</body>
</html>`;
}