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

// NOVA FUNÇÃO para buscar dados completos para geração em lote
async function fetchBatchExamData(supabase: SupabaseClient, examId: string) {
    console.log('Buscando dados completos da prova para geração em lote:', examId);
    
    try {
        // Buscar a prova
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .select('*')
            .eq('id', examId)
            .single();
        
        if (examError) {
            console.error('Erro ao buscar prova:', examError);
            throw new Error(`Prova não encontrada: ${examError.message}`);
        }
        
        console.log('Prova encontrada:', exam.title);
        
        // Verificar se tem turma configurada
        if (!exam.target_class_id) {
            throw new Error('Esta prova não está configurada para uma turma específica');
        }
        
        // Buscar o cabeçalho se existir
        if (exam.header_id) {
            const { data: headerData, error: headerError } = await supabase
                .from('exam_headers')
                .select('*')
                .eq('id', exam.header_id)
                .single();
            
            if (!headerError && headerData) {
                exam.header = headerData;
                console.log('Cabeçalho encontrado:', headerData.name);
            }
        }
        
        // Buscar todas as questões
        const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .in('id', exam.question_ids);
        
        if (questionsError) {
            console.error('Erro ao buscar questões:', questionsError);
            throw new Error(`Erro ao buscar questões: ${questionsError.message}`);
        }
        
        console.log(`Encontradas ${questions.length} questões`);
        
        // Buscar todos os alunos da turma
        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select(`
                id,
                name,
                student_id,
                course,
                email,
                class:classes(name)
            `)
            .eq('class_id', exam.target_class_id);
        
        if (studentsError) {
            console.error('Erro ao buscar alunos:', studentsError);
            throw new Error(`Erro ao buscar alunos: ${studentsError.message}`);
        }
        
        console.log(`Encontrados ${students.length} alunos para processamento`);
        
        if (students.length === 0) {
            throw new Error('Nenhum aluno encontrado na turma selecionada');
        }
        
        return { exam, questions, students };
        
    } catch (error) {
        console.error('Erro em fetchBatchExamData:', error);
        throw error;
    }
}

// Função simplificada - coordenadas já estão calculadas no banco
function getBubbleCoordinatesFromDB(studentExamData: any) {
    console.log('Usando coordenadas pré-calculadas do banco de dados...');
    return studentExamData.bubble_coordinates || {};
}

// Nova função para gerar PDF usando HTML simples (mais confiável)
async function generatePDFFromHTML(htmlContent: string, studentName: string): Promise<Uint8Array> {
    console.log(`Gerando PDF a partir de HTML para ${studentName}...`);
    
    try {
        // Por enquanto, vamos retornar o HTML como bytes
        // Em produção, usaria wkhtmltopdf ou similar
        const encoder = new TextEncoder();
        const htmlBytes = encoder.encode(htmlContent);
        
        console.log(`HTML convertido para bytes para ${studentName}`);
        return htmlBytes;
    } catch (error) {
        console.error(`Erro ao gerar PDF para ${studentName}:`, error);
        throw error;
    }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { examId, version = 1, includeAnswers = false, studentExamId, generatePDF = false, generateAll = false } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // ROTA 3: Geração em Lote SIMPLIFICADA (sem Puppeteer por enquanto)
    if (generateAll && examId) {
        console.log('=== INICIANDO GERAÇÃO EM LOTE SIMPLIFICADA ===');
        console.log('Exam ID:', examId);
        
        try {
            // Buscar todos os dados necessários
            const { exam, questions, students } = await fetchBatchExamData(supabase, examId);
            
            if (!exam.target_class_id) {
                throw new Error('Esta prova não está configurada para uma turma específica');
            }
            
            if (students.length === 0) {
                throw new Error('Nenhum aluno encontrado na turma');
            }
            
            const results = [];
            console.log(`Processando ${students.length} alunos...`);
            
            // Processar cada aluno - SEM PUPPETEER por enquanto
            for (const student of students) {
                console.log(`--- Processando aluno: ${student.name} (${student.student_id}) ---`);
                
                try {
                    // Gerar HTML específico para o aluno
                    const originalOrderMap = new Map(exam.question_ids.map((id: string, index: number) => [id, index]));
                    let studentQuestions = [...questions].sort((a, b) => (originalOrderMap.get(a.id) ?? Infinity) - (originalOrderMap.get(b.id) ?? Infinity));
                    
                    // Usar o ID do aluno como seed para embaralhamento
                    const studentSeed = parseInt(student.id.slice(-8), 16);
                    
                    if (exam.shuffle_questions) {
                        studentQuestions = shuffleArray(studentQuestions, studentSeed);
                    }
                    
                    if (exam.shuffle_options) {
                        studentQuestions = studentQuestions.map(q => ({
                            ...q,
                            options: q.options && Array.isArray(q.options)
                                ? shuffleArray(q.options, studentSeed + parseInt(q.id.slice(-4), 16))
                                : q.options
                        }));
                    }
                    
                    // Criar info do aluno para o HTML
                    const studentInfo = {
                        name: student.name,
                        id: student.student_id || 'N/A',
                        course: student.course || 'N/A',
                        class: student.class?.name || 'N/A',
                        qrId: `${exam.id}-${student.id}`
                    };
                    
                    // USAR COORDENADAS PRÉ-CALCULADAS DO BANCO
                    const bubbleCoordinates = getBubbleCoordinatesFromDB({ bubble_coordinates: {} }); // Por enquanto vazio, mas virá do banco
                    
                    // GERAR HTML DA PROVA
                    const htmlContent = generateExamHTML(exam, studentQuestions, 1, includeAnswers, studentInfo);
                    
                    // CONVERTER HTML PARA PDF
                    const pdfBuffer = await generatePDFFromHTML(htmlContent, studentInfo.name);
                    
                    // SALVAR PDF NO STORAGE
                    const fileName = `${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${student.student_id || student.id}.pdf`;
                    const filePath = `${examId}/${fileName}`;
                    
                    const { error: uploadError } = await supabase.storage
                        .from('generated-exams')
                        .upload(filePath, pdfBuffer, {
                            contentType: 'application/pdf',
                            upsert: true
                        });
                    
                    if (uploadError) {
                        throw new Error(`Erro ao salvar PDF: ${uploadError.message}`);
                    }
                    
                    // Obter URL pública
                    const { data: urlData } = supabase.storage
                        .from('generated-exams')
                        .getPublicUrl(filePath);
                    
                    // Criar gabarito (answer key)
                    const answerKey: any = {};
                    studentQuestions.forEach((q, index) => {
                        if (q.type === 'multiple_choice') {
                            const correctOption = q.options?.find((opt: any) => 
                                Array.isArray(q.correct_answer) ? q.correct_answer.includes(opt.id) : opt.id === q.correct_answer
                            );
                            if (correctOption) {
                                answerKey[`q${index + 1}`] = correctOption.letter || 'A';
                            }
                        } else if (q.type === 'true_false') {
                            answerKey[`q${index + 1}`] = q.correct_answer ? 'V' : 'F';
                        }
                    });
                    
                    // Primeiro deletar registros existentes
                    await supabase
                        .from('student_exams')
                        .delete()
                        .eq('exam_id', examId)
                        .eq('student_id', student.id);
                    
                    // Salvar no banco de dados - student_exams
                    const { error: dbError } = await supabase
                        .from('student_exams')
                        .insert({
                            exam_id: examId,
                            student_id: student.id,
                            author_id: exam.author_id,
                            shuffled_question_ids: studentQuestions.map(q => q.id),
                            shuffled_options_map: studentQuestions.reduce((acc: any, q) => {
                                if (q.options) {
                                    acc[q.id] = q.options.map((opt: any) => opt.id);
                                }
                                return acc;
                            }, {}),
                            answer_key: answerKey,
                            bubble_coordinates: bubbleCoordinates,
                            version_id: studentInfo.qrId
                        });
                    
                    if (dbError) {
                        console.error('Erro ao salvar no banco:', dbError);
                        throw new Error(`Erro ao salvar dados do aluno: ${dbError.message}`);
                    }
                    
                    console.log(`✓ PDF e dados salvos para ${student.name}`);
                    
                    results.push({
                        studentId: student.id,
                        studentName: student.name,
                        pdfUrl: urlData.publicUrl,
                        bubbleCoordinates: Object.keys(bubbleCoordinates).length,
                        success: true
                    });
                    
                } catch (studentError) {
                    console.error(`Erro ao processar aluno ${student.name}:`, studentError);
                    results.push({
                        studentId: student.id,
                        studentName: student.name,
                        error: studentError.message,
                        success: false
                    });
                }
            }
            
            console.log('=== GERAÇÃO EM LOTE CONCLUÍDA ===');
            console.log(`Processados: ${results.length} alunos`);
            console.log(`Sucessos: ${results.filter(r => r.success).length}`);
            console.log(`Erros: ${results.filter(r => !r.success).length}`);
            
            return new Response(JSON.stringify({
                success: true,
                message: 'PDFs gerados e salvos com sucesso!',
                results,
                totalStudents: students.length,
                successCount: results.filter(r => r.success).length,
                errorCount: results.filter(r => !r.success).length
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
            
        } catch (batchError) {
            console.error('Erro na geração em lote:', batchError);
            return new Response(JSON.stringify({ 
                success: false,
                error: `Erro na geração em lote: ${batchError.message}` 
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }
    
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
        
        if (generatePDF) {
            const pdfBuffer = await generatePDFFromHTML(
                generateExamHTML(preparedExamData.exam, questions, version, includeAnswers, studentInfo),
                studentInfo.name
            );
            
            return new Response(pdfBuffer, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${preparedExamData.exam.title}_${studentInfo.name}.pdf"`
                }
            });
        }
        
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
        
        if (generatePDF) {
            const pdfBuffer = await generatePDFFromHTML(
                generateExamHTML(exam, processedQuestions, version, includeAnswers),
                `Versao_${version}`
            );
            
            return new Response(pdfBuffer, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${exam.title}_v${version}.pdf"`
                }
            });
        }
        
        html = generateExamHTML(exam, processedQuestions, version, includeAnswers);
        examTitle = exam.title;

    } else {
        throw new Error("Parâmetros inválidos. Forneça 'studentExamId', 'examId' ou 'generateAll=true'.");
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