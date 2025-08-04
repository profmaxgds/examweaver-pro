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
                exam.exam_headers = headerData; // Usar exam_headers como esperado no layout
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
        if (questions.length > 0) {
            console.log('Primeira questão detalhes:', {
                id: questions[0].id,
                title: questions[0].title,
                type: questions[0].type,
                hasOptions: !!questions[0].options,
                optionsCount: questions[0].options?.length || 0,
                hasCorrectAnswer: !!questions[0].correct_answer
            });
        }
        
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

// Função para calcular coordenadas precisas dos bubbles
function calculateBubbleCoordinates(questions: any[], exam: any) {
    console.log('Calculando coordenadas dos bubbles...');
    console.log('Calculando coordenadas para papel A4...');
    
    const coordinates: any = {};
    
    // === DIMENSÕES DA PÁGINA A4 ===
    const pageWidthPt = 595; // 210mm
    const pageHeightPt = 842; // 297mm
    const bodyPaddingPt = 42.52; // 1.5cm (body padding)
    
    // === CONFIGURAÇÕES DO LAYOUT (exatas do CSS) ===
    const bubbleSize = 11; // --bubble-size: 11px
    const bubbleMargin = 2.5; // --bubble-margin: 0 2.5px
    const bubbleBorder = 1; // border: 1px solid #000
    const anchorWidth = 11; // --anchor-width
    const anchorMarginRight = 7; // --anchor-margin-right
    const qNumberWidth = 30; // --q-number-width
    const qNumberMarginRight = 6; // --q-number-margin-right
    const rowHeight = 15; // height: 15px por linha
    const rowMarginBottom = 4; // margin-bottom: 4px
    
    // === CÁLCULO EXATO DOS OFFSETS VERTICAIS (baseado no CSS real) ===
    let yOffset = bodyPaddingPt; // body { padding: 1.5cm; }
    
    // 1. CUSTOM HEADER (CSS exato)
    const customHeaderFontSize = 11; // font-size: 11pt
    const customHeaderLineHeight = 1.5; // line-height: 1.5
    const customHeaderPaddingBottom = 10; // padding-bottom: 10px
    const customHeaderMarginBottom = 25; // margin-bottom: 25px
    const customHeaderBorderBottom = 2; // border-bottom: 2px solid #000
    
    // Altura real do custom-header baseada no conteúdo
    // 5 linhas de texto (instituição, professor, disciplina, curso, aluno) + 1 linha de detalhes
    const headerTextLines = 6;
    const headerTextHeight = headerTextLines * (customHeaderFontSize * customHeaderLineHeight);
    const headerTotalHeight = Math.max(80, headerTextHeight) + customHeaderPaddingBottom + customHeaderMarginBottom + customHeaderBorderBottom;
    yOffset += headerTotalHeight;
    
    // 2. INSTRUCTIONS (se existir - CSS exato)
    if (exam?.instructions) {
        const instructionsFontSize = 10; // font-size: 10pt
        const instructionsPadding = 20; // padding: 10px (top+bottom)
        const instructionsMarginBottom = 25; // margin-bottom: 25px
        const instructionsBorder = 2; // border: 1px solid (top+bottom)
        
        // Estimar altura baseada no comprimento do texto
        const estimatedLines = Math.ceil(exam.instructions.length / 80); // ~80 chars por linha
        const instructionsTextHeight = estimatedLines * (instructionsFontSize * 1.4); // line-height default
        const instructionsTotalHeight = instructionsTextHeight + instructionsPadding + instructionsMarginBottom + instructionsBorder;
        yOffset += instructionsTotalHeight;
    }
    
    // 3. ANSWER-SHEET-CONTAINER componentes (CSS exato)
    const answerSheetMarginBottom = 25; // margin-bottom: 25px
    const answerGridPaddingTop = 10; // padding: 10px 5px (top)
    const answerGridHeaderFontSize = 9; // font-size: 9pt
    const answerGridHeaderMarginBottom = 8; // margin-bottom: 8px
    const answerOptionsHeaderHeight = 15; // height: 15px
    const answerOptionsHeaderMarginBottom = 4; // margin-bottom: 4px
    
    // Altura do cabeçalho da grade (uma linha de texto)
    const answerGridHeaderHeight = answerGridHeaderFontSize * 1.4; // line-height estimado
    
    // Somar tudo até o início das linhas de questões
    yOffset += answerGridPaddingTop + answerGridHeaderHeight + answerGridHeaderMarginBottom + 
              answerOptionsHeaderHeight + answerOptionsHeaderMarginBottom;
    
    // === CONFIGURAÇÃO DAS COLUNAS ===
    const totalQuestions = questions.length;
    const numCols = totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3;
    const questionsPerColumn = Math.ceil(totalQuestions / numCols);
    
    // === CÁLCULO DOS OFFSETS HORIZONTAIS (CSS exato) ===
    let xOffset = bodyPaddingPt; // body { padding: 1.5cm; } - margem esquerda
    
    // Largura da seção QR Code
    const qrCodeSectionWidth = 140; // flex: 0 0 140px
    xOffset += qrCodeSectionWidth;
    
    // Gap entre QR e grid
    const gapBetweenQrAndGrid = 8.5; // gap: 0.3cm convertido para pontos
    xOffset += gapBetweenQrAndGrid;
    
    // Padding da answer-grid-section
    const answerGridPaddingLeft = 5; // padding: 10px 5px (left)
    xOffset += answerGridPaddingLeft;
    
    // Largura disponível para as colunas
    const answerGridPaddingRight = 5; // padding: 10px 5px (right)
    const remainingWidth = pageWidthPt - xOffset - bodyPaddingPt - answerGridPaddingRight;
    
    // Configuração dos divisores de coluna
    const columnDividerWidth = 1.5; // width: 1.5px
    const columnDividerMarginLeft = 10; // margin: 0 10px
    const columnDividerMarginRight = 10; // margin: 0 10px
    const columnDividerTotalWidth = columnDividerWidth + columnDividerMarginLeft + columnDividerMarginRight;
    const totalDividerWidth = (numCols - 1) * columnDividerTotalWidth;
    const columnWidth = (remainingWidth - totalDividerWidth) / numCols;
    
    // Espaçamento à esquerda dentro de cada coluna (antes dos bubbles)
    const totalLeftSpacing = anchorWidth + anchorMarginRight + qNumberWidth + qNumberMarginRight;
    
    let currentColumn = 0;
    let questionInColumn = 0;
    
    questions.forEach((question, questionIndex) => {
        const questionNumber = questionIndex + 1;
        
        // Determinar qual coluna esta questão está
        if (questionInColumn >= questionsPerColumn && currentColumn < numCols - 1) {
            currentColumn++;
            questionInColumn = 0;
        }
        
        // === CÁLCULO DA POSIÇÃO Y ===
        const questionY = yOffset + (questionInColumn * (rowHeight + rowMarginBottom));
        
        // === CÁLCULO DA POSIÇÃO X ===
        const columnStartX = xOffset + (currentColumn * (columnWidth + columnDividerTotalWidth));
        const questionBaseX = columnStartX + totalLeftSpacing;
        
        // Calcular coordenadas dos bubbles para esta questão
        const questionCoords: any = {
            bubbles: {},
            correct: null
        };
        
        if (question.type === 'essay') {
            // Questões dissertativas não têm bubbles
            questionCoords.type = 'essay';
        } else {
            // Determinar número de opções
            let numOptions = 5; // padrão
            if (question.type === 'true_false') {
                numOptions = 2;
            } else if (question.options && Array.isArray(question.options)) {
                numOptions = question.options.length;
            }
            
            // Calcular coordenadas de cada bubble
            for (let optionIndex = 0; optionIndex < numOptions; optionIndex++) {
                const optionLetter = String.fromCharCode(65 + optionIndex); // A, B, C...
                
                // Posição X do bubble (considerando margens)
                const bubbleX = questionBaseX + (optionIndex * (bubbleSize + (bubbleMargin * 2)));
                
                // Coordenadas completas: x, y, width, height (incluindo borda)
                const bubbleCoords = {
                    x: bubbleX - bubbleBorder,
                    y: questionY - bubbleBorder,
                    w: bubbleSize + (bubbleBorder * 2),
                    h: bubbleSize + (bubbleBorder * 2)
                };
                
                questionCoords.bubbles[optionLetter] = bubbleCoords;
                
                // Verificar se é a resposta correta
                let isCorrect = false;
                if (question.type === 'multiple_choice') {
                    const correctOption = question.options?.find((opt: any) => 
                        Array.isArray(question.correct_answer) 
                            ? question.correct_answer.includes(opt.id) 
                            : opt.id === question.correct_answer
                    );
                    isCorrect = correctOption && optionIndex < question.options.length && 
                               question.options[optionIndex].id === correctOption.id;
                } else if (question.type === 'true_false') {
                    isCorrect = (optionIndex === 0 && question.correct_answer === true) || 
                               (optionIndex === 1 && question.correct_answer === false);
                }
                
                if (isCorrect) {
                    questionCoords.correct = {
                        option: optionLetter,
                        coordinates: bubbleCoords
                    };
                }
            }
        }
        
        coordinates[`q${questionNumber}`] = questionCoords;
        questionInColumn++;
    });
    
    // Calcular dimensões totais da página
    const pageWidth = 595; // largura padrão A4 em pontos (210mm)
    const pageHeight = 842; // altura padrão A4 em pontos (297mm)
    
    const result = {
        page_dimensions: {
            width: pageWidth,
            height: pageHeight,
            unit: 'pt' // pontos typográficos
        },
        questions: coordinates
    };
    
    console.log(`Coordenadas calculadas para ${questions.length} questões`);
    console.log('Dimensões da página:', result.page_dimensions);
    console.log('Exemplo primeira questão:', coordinates.q1);
    
    return result;
}

// Função para gerar apenas HTML (sem APIs externas problemáticas)
async function generatePDFFromHTML(htmlContent: string, studentName: string): Promise<{ htmlBytes: Uint8Array, pdfBytes?: Uint8Array }> {
    console.log(`Processando HTML para ${studentName}...`);
    
    try {
        // SEMPRE retornar HTML (garantido que funciona)
        const encoder = new TextEncoder();
        const htmlBytes = encoder.encode(htmlContent);
        
        console.log(`✓ HTML gerado com sucesso para ${studentName}`);
        
        // Por enquanto, não tentar gerar PDF com APIs externas
        // pois estão causando problemas e retornando JSON em vez de PDF
        
        return { htmlBytes, pdfBytes: undefined };
    } catch (error) {
        console.error(`Erro crítico ao processar HTML para ${studentName}:`, error);
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
                        qrId: null // Será preenchido após inserção no banco
                    };
                    
                    // CALCULAR COORDENADAS DOS BUBBLES
                    const bubbleCoordinates = calculateBubbleCoordinates(studentQuestions, exam);
                    
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
                    
                    // Salvar no banco de dados - student_exams e obter o ID real
                    const { data: insertedData, error: dbError } = await supabase
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
                            version_id: null // Para alunos, version_id deve ser null
                        })
                        .select('id')
                        .single();
                    
                    if (dbError) {
                        console.error('Erro ao salvar no banco:', dbError);
                        throw new Error(`Erro ao salvar dados do aluno: ${dbError.message}`);
                    }
                    
                    // AGORA temos o ID real do student_exams
                    const realStudentExamId = insertedData.id;
                    console.log(`✓ Student exam criado com ID: ${realStudentExamId}`);
                    
                    // Atualizar studentInfo com o ID real para regeração do QR code
                    studentInfo.qrId = realStudentExamId;
                    
                    // GERAR PROVA (sem respostas) - adicionar logs para debug
                    console.log(`Gerando prova para ${student.name} com ${studentQuestions.length} questões`);
                    console.log('Primeira questão:', studentQuestions[0]?.title, 'tipo:', studentQuestions[0]?.type);
                    
                    const examHtmlContent = generateExamHTML(exam, studentQuestions, 1, false, studentInfo);
                    const examEncoder = new TextEncoder();
                    const examHtmlBytes = examEncoder.encode(examHtmlContent);
                    
                    // GERAR GABARITO (com respostas marcadas)
                    console.log(`Gerando gabarito para ${student.name} com respostas corretas`);
                    const answerKeyHtmlContent = generateExamHTML(exam, studentQuestions, 1, true, studentInfo);
                    const answerKeyEncoder = new TextEncoder();
                    const answerKeyHtmlBytes = answerKeyEncoder.encode(answerKeyHtmlContent);
                    
                    // SALVAR PROVA NO STORAGE
                    const examFileName = `PROVA_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${student.student_id || student.id}.html`;
                    const examFilePath = `${examId}/provas/${examFileName}`;
                    
                    const { error: examUploadError } = await supabase.storage
                        .from('generated-exams')
                        .upload(examFilePath, examHtmlBytes, {
                            contentType: 'text/html',
                            upsert: true
                        });
                    
                    if (examUploadError) {
                        console.error(`Erro ao salvar prova para ${student.name}:`, examUploadError);
                        throw new Error(`Erro ao salvar prova: ${examUploadError.message}`);
                    }
                    
                    // SALVAR GABARITO NO STORAGE
                    const answerKeyFileName = `GABARITO_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}_${student.student_id || student.id}.html`;
                    const answerKeyFilePath = `${examId}/gabaritos/${answerKeyFileName}`;
                    
                    const { error: answerKeyUploadError } = await supabase.storage
                        .from('generated-exams')
                        .upload(answerKeyFilePath, answerKeyHtmlBytes, {
                            contentType: 'text/html',
                            upsert: true
                        });
                    
                    if (answerKeyUploadError) {
                        console.error(`Erro ao salvar gabarito para ${student.name}:`, answerKeyUploadError);
                        throw new Error(`Erro ao salvar gabarito: ${answerKeyUploadError.message}`);
                    }
                    
                    // SALVAR HTML DO GABARITO DIRETAMENTE NO BANCO
                    const { error: updateHtmlError } = await supabase
                        .from('student_exams')
                        .update({ 
                            html_content: answerKeyHtmlContent 
                        })
                        .eq('id', realStudentExamId);
                    
                    if (updateHtmlError) {
                        console.error(`Erro ao salvar HTML do gabarito para ${student.name}:`, updateHtmlError);
                    } else {
                        console.log(`✓ HTML do gabarito salvo no banco para ${student.name}`);
                    }
                    
                    // OBTER URLs dos arquivos
                    const { data: examUrlData } = supabase.storage
                        .from('generated-exams')
                        .getPublicUrl(examFilePath);
                    
                    const { data: answerKeyUrlData } = supabase.storage
                        .from('generated-exams')
                        .getPublicUrl(answerKeyFilePath);
                    
                    console.log(`✓ Prova salva: ${examFileName}`);
                    console.log(`✓ Gabarito salvo: ${answerKeyFileName}`);
                    
                    results.push({
                        studentId: student.id,
                        studentName: student.name,
                        studentExamId: realStudentExamId,
                        examUrl: examUrlData.publicUrl,
                        answerKeyUrl: answerKeyUrlData.publicUrl,
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
                message: 'Provas e gabaritos gerados em HTML!',
                results,
                totalStudents: students.length,
                successCount: results.filter(r => r.success).length,
                errorCount: results.filter(r => !r.success).length,
                examCount: results.filter(r => r.success).length,
                answerKeyCount: results.filter(r => r.success).length
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
            qrId: studentExamId // Usar o studentExamId real que foi passado como parâmetro
        };
        
        if (generatePDF) {
            const { htmlBytes, pdfBytes } = await generatePDFFromHTML(
                generateExamHTML(preparedExamData.exam, questions, version, includeAnswers, studentInfo),
                studentInfo.name
            );
            
            // Priorizar PDF se disponível, senão HTML
            const responseBytes = pdfBytes || htmlBytes;
            const contentType = pdfBytes ? 'application/pdf' : 'text/html';
            const fileExtension = pdfBytes ? 'pdf' : 'html';
            
            return new Response(responseBytes, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': contentType,
                    'Content-Disposition': `attachment; filename="${preparedExamData.exam.title}_${studentInfo.name}.${fileExtension}"`
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
            const { htmlBytes, pdfBytes } = await generatePDFFromHTML(
                generateExamHTML(exam, processedQuestions, version, includeAnswers),
                `Versao_${version}`
            );
            
            // Priorizar PDF se disponível, senão HTML
            const responseBytes = pdfBytes || htmlBytes;
            const contentType = pdfBytes ? 'application/pdf' : 'text/html';
            const fileExtension = pdfBytes ? 'pdf' : 'html';
            
            return new Response(responseBytes, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': contentType,
                    'Content-Disposition': `attachment; filename="${exam.title}_v${version}.${fileExtension}"`
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