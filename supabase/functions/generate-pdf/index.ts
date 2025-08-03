// supabase/functions/generate-pdf/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { examId, version = 1, includeAnswers = false, studentExamId, format = 'html', generateAll = false } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // ROTA 3: Geração em Lote SIMPLIFICADA (apenas HTML)
    if (generateAll && examId) {
        console.log('=== INICIANDO GERAÇÃO EM LOTE HTML ===');
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
            
            // Processar cada aluno - apenas HTML
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
                        student_id: student.student_id || 'N/A'
                    };
                    
                    // GERAR HTML DA PROVA
                    const htmlContent = generateExamHTML(
                      exam,
                      studentQuestions,
                      parseInt(student.student_id || '1'),
                      false,
                      studentInfo
                    );
                    
                    // Upload apenas HTML content
                    const htmlFileName = `exam_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().getTime()}.html`;
                    const htmlBytes = new TextEncoder().encode(htmlContent);
                    
                    const { error: htmlUploadError } = await supabase.storage
                        .from('exam-files')
                        .upload(htmlFileName, htmlBytes, {
                            contentType: 'text/html',
                            upsert: true
                        });

                    if (htmlUploadError) {
                        console.error(`❌ Erro ao fazer upload do HTML para ${student.name}:`, htmlUploadError);
                    } else {
                        console.log(`✅ HTML enviado com sucesso para ${student.name}: ${htmlFileName}`);
                        const htmlUrl = supabase.storage.from('exam-files').getPublicUrl(htmlFileName).data.publicUrl;
                        
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
                        
                        // Salvar no banco de dados
                        const { data: insertedExam, error: dbError } = await supabase
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
                                bubble_coordinates: {},
                                version_id: null
                            })
                            .select('id')
                            .single();
                        
                        if (dbError) {
                            console.error('Erro ao salvar no banco:', dbError);
                            throw new Error(`Erro ao salvar dados do aluno: ${dbError.message}`);
                        }
                        
                        // Re-generate final HTML with correct QR codes
                        const finalHtmlContent = generateExamHTML(
                          exam,
                          studentQuestions,
                          parseInt(student.student_id || '1'),
                          false,
                          studentInfo
                        );

                        const finalHtmlFileName = `final_exam_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().getTime()}.html`;
                        const finalHtmlBytes = new TextEncoder().encode(finalHtmlContent);
                        
                        await supabase.storage
                            .from('exam-files')
                            .upload(finalHtmlFileName, finalHtmlBytes, {
                                contentType: 'text/html',
                                upsert: true
                            });
                        const finalHtmlUrl = supabase.storage.from('exam-files').getPublicUrl(finalHtmlFileName).data.publicUrl;

                        // Update student_exams with file URLs
                        await supabase
                            .from('student_exams')
                            .update({
                                html_url: finalHtmlUrl
                            })
                            .eq('id', insertedExam.id);

                        results.push({
                            student: student.name,
                            success: true,
                            htmlUrl: finalHtmlUrl,
                            studentExamId: insertedExam.id
                        });
                    }
                } catch (studentError) {
                    console.error(`❌ Erro ao processar estudante ${student.name}:`, studentError);
                    results.push({
                        student: student.name,
                        success: false,
                        error: studentError instanceof Error ? studentError.message : 'Erro desconhecido',
                        htmlUrl: null,
                        studentExamId: null
                    });
                }
            }
            
            return new Response(
                JSON.stringify({
                    success: true,
                    message: `HTMLs gerados para ${results.filter(r => r.success).length}/${results.length} estudantes`,
                    results: results,
                    totalStudents: students.length,
                    successfulGenerations: results.filter(r => r.success).length,
                    failedGenerations: results.filter(r => !r.success).length
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            );
            
        } catch (batchError) {
            console.error('❌ Erro na geração em lote:', batchError);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: batchError instanceof Error ? batchError.message : 'Erro desconhecido na geração em lote',
                    details: 'Verifique os logs do servidor para mais informações'
                }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            );
        }
    }
    
    // ROTA 1: Gerar por versão usando examId
    if (examId && !studentExamId) {
        console.log('Gerando exame por versão:', { examId, version, includeAnswers });
        
        const { exam, questions } = await fetchVersionExamData(supabase, examId);
        
        // Shuffle questions if needed
        const originalOrderMap = new Map(exam.question_ids.map((id: string, index: number) => [id, index]));
        let orderedQuestions = [...questions].sort((a, b) => (originalOrderMap.get(a.id) ?? Infinity) - (originalOrderMap.get(b.id) ?? Infinity));
        
        if (exam.shuffle_questions) {
            orderedQuestions = shuffleArray(orderedQuestions, version);
        }
        
        if (exam.shuffle_options) {
            orderedQuestions = orderedQuestions.map(q => ({
                ...q,
                options: q.options && Array.isArray(q.options)
                    ? shuffleArray(q.options, version + parseInt(q.id.slice(-4), 16))
                    : q.options
            }));
        }
        
        // Generate HTML content
        const htmlContent = generateExamHTML(exam, orderedQuestions, version, includeAnswers);
        
        // Always return HTML content
        const htmlBytes = new TextEncoder().encode(htmlContent);
        
        return new Response(htmlBytes, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/html',
                'Content-Disposition': `attachment; filename="exam_version_${version}${includeAnswers ? '_gabarito' : ''}.html"`
            }
        });
    }
    
    // ROTA 2: Gerar prova já preparada usando studentExamId
    if (studentExamId) {
        console.log('Gerando prova preparada:', { studentExamId, includeAnswers });
        
        const { preparedExamData, questions } = await fetchPreparedExamData(supabase, studentExamId);
        
        // Generate HTML content
        const htmlContent = generateExamHTML(
            preparedExamData.exam, 
            questions, 
            1, 
            includeAnswers, 
            preparedExamData.student_info
        );
        
        // Always return HTML content
        const htmlBytes = new TextEncoder().encode(htmlContent);
        
        return new Response(htmlBytes, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/html',
                'Content-Disposition': `attachment; filename="exam_${preparedExamData.student_info?.name || 'student'}${includeAnswers ? '_gabarito' : ''}.html"`
            }
        });
    }
    
    return new Response(
        JSON.stringify({ 
            success: false, 
            error: 'Parâmetros insuficientes. Forneça examId ou studentExamId.' 
        }),
        {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
    
  } catch (error) {
    console.error('❌ Erro na função generate-pdf:', error);
    return new Response(
        JSON.stringify({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Erro interno do servidor',
            details: 'Verifique os logs do servidor para mais informações'
        }),
        {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
  }
});