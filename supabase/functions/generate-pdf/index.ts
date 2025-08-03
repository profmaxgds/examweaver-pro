// supabase/functions/generate-pdf/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

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

// FUNÇÃO para calcular coordenadas das bolhas matematicamente (baseado no layout CSS)
function calculateBubbleCoordinates(studentQuestions: any[], exam: any) {
    console.log('Calculando coordenadas das bolhas matematicamente...');
    
    const bubbleCoordinates: any = {};
    
    // Constantes baseadas no CSS do layout
    const PAGE_MARGIN = 42.5; // 1.5cm em pontos (1cm = 28.35 pontos)
    const ANSWER_GRID_TOP = 150; // Posição aproximada do grid
    const BUBBLE_SIZE = 11;
    const BUBBLE_MARGIN = 2.5;
    const Q_NUMBER_WIDTH = 30;
    const Q_NUMBER_MARGIN = 6;
    const ANCHOR_WIDTH = 11;
    const ANCHOR_MARGIN = 7;
    const ROW_HEIGHT = 15;
    const COLUMN_GAP = 30;
    
    // Calcular número de colunas baseado no total de questões
    const totalQuestions = studentQuestions.length;
    const numCols = totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3;
    const questionsPerColumn = Math.ceil(totalQuestions / numCols);
    
    studentQuestions.forEach((q, globalIndex) => {
        if (q.type === 'multiple_choice' && q.options) {
            const questionNumber = globalIndex + 1;
            
            // Determinar em qual coluna está a questão
            const columnIndex = Math.floor(globalIndex / questionsPerColumn);
            const rowInColumn = globalIndex % questionsPerColumn;
            
            // Calcular posição X da coluna
            const columnStartX = PAGE_MARGIN + (columnIndex * (200 + COLUMN_GAP)); // 200px largura aproximada por coluna
            
            // Calcular posição Y da linha
            const rowY = ANSWER_GRID_TOP + (rowInColumn * ROW_HEIGHT) + 25; // +25 para o header das opções
            
            // Posição X base das bolhas (após âncora e número da questão)
            const bubblesStartX = columnStartX + ANCHOR_WIDTH + ANCHOR_MARGIN + Q_NUMBER_WIDTH + Q_NUMBER_MARGIN;
            
            bubbleCoordinates[questionNumber] = {};
            
            q.options.forEach((opt: any, optIndex: number) => {
                const letter = String.fromCharCode(65 + optIndex); // A, B, C, D
                
                const bubbleX = bubblesStartX + (optIndex * (BUBBLE_SIZE + (BUBBLE_MARGIN * 2)));
                
                bubbleCoordinates[questionNumber][letter] = {
                    x: Math.round(bubbleX),
                    y: Math.round(rowY),
                    width: BUBBLE_SIZE,
                    height: BUBBLE_SIZE,
                    centerX: Math.round(bubbleX + (BUBBLE_SIZE / 2)),
                    centerY: Math.round(rowY + (BUBBLE_SIZE / 2))
                };
            });
        }
    });
    
    console.log(`Coordenadas calculadas para ${Object.keys(bubbleCoordinates).length} questões`);
    return bubbleCoordinates;
}

// FUNÇÃO para gerar PDF usando jsPDF
async function generatePDFWithJsPDF(exam: any, studentQuestions: any[], studentInfo: any, includeAnswers: boolean = false) {
    console.log(`Gerando PDF com jsPDF para ${studentInfo.name}...`);
    
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4'
        });
        
        // Configurações da página A4 em pontos
        const pageWidth = 595;
        const pageHeight = 842;
        const margin = 42.5; // 1.5cm
        
        let currentY = margin;
        
        // CABEÇALHO
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(exam.title, margin, currentY);
        currentY += 25;
        
        if (exam.professor_name) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`Professor: ${exam.professor_name}`, margin, currentY);
            currentY += 20;
        }
        
        // INFORMAÇÕES DO ALUNO
        doc.setFontSize(10);
        doc.text(`Aluno: ${studentInfo.name}`, margin, currentY);
        doc.text(`Matrícula: ${studentInfo.id}`, pageWidth - 200, currentY);
        currentY += 15;
        doc.text(`Turma: ${studentInfo.class}`, margin, currentY);
        doc.text(`Curso: ${studentInfo.course}`, pageWidth - 200, currentY);
        currentY += 25;
        
        // QR CODE (simulado como texto por enquanto)
        doc.setFontSize(8);
        doc.text(`QR: ${studentInfo.qrId}`, margin, currentY);
        currentY += 20;
        
        // GRID DE RESPOSTAS
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('GABARITO - Marque completamente as alternativas:', margin, currentY);
        currentY += 20;
        
        // Desenhar grid de respostas
        const gridStartY = currentY;
        const bubbleSize = 11;
        const bubbleSpacing = 25;
        const rowHeight = 15;
        
        // Cabeçalho das opções (A, B, C, D)
        doc.setFontSize(9);
        ['A', 'B', 'C', 'D'].forEach((letter, index) => {
            doc.text(letter, margin + 50 + (index * bubbleSpacing), currentY);
        });
        currentY += 15;
        
        // Desenhar bolhas para cada questão
        studentQuestions.forEach((q, index) => {
            const questionNum = index + 1;
            
            if (q.type === 'multiple_choice' && q.options) {
                // Número da questão
                doc.setFont('helvetica', 'bold');
                doc.text(`${questionNum}.`, margin, currentY + 8);
                
                // Desenhar bolhas
                q.options.forEach((opt: any, optIndex: number) => {
                    const bubbleX = margin + 50 + (optIndex * bubbleSpacing);
                    const bubbleY = currentY;
                    
                    doc.circle(bubbleX + (bubbleSize/2), bubbleY + (bubbleSize/2), bubbleSize/2, 'S');
                    
                    // Marcar resposta correta se incluir respostas
                    if (includeAnswers) {
                        const isCorrect = Array.isArray(q.correct_answer) ? 
                            q.correct_answer.includes(opt.id) : 
                            opt.id === q.correct_answer;
                        
                        if (isCorrect) {
                            doc.circle(bubbleX + (bubbleSize/2), bubbleY + (bubbleSize/2), bubbleSize/3, 'F');
                        }
                    }
                });
                
                currentY += rowHeight;
            } else if (q.type === 'true_false') {
                // Número da questão
                doc.setFont('helvetica', 'bold');
                doc.text(`${questionNum}.`, margin, currentY + 8);
                
                // Bolhas V/F
                ['V', 'F'].forEach((letter, index) => {
                    const bubbleX = margin + 50 + (index * bubbleSpacing);
                    const bubbleY = currentY;
                    
                    doc.circle(bubbleX + (bubbleSize/2), bubbleY + (bubbleSize/2), bubbleSize/2, 'S');
                    doc.text(letter, bubbleX + (bubbleSize/2) - 3, bubbleY + (bubbleSize/2) + 3);
                    
                    // Marcar resposta correta se incluir respostas
                    if (includeAnswers) {
                        const isCorrect = (letter === 'V' && q.correct_answer) || (letter === 'F' && !q.correct_answer);
                        if (isCorrect) {
                            doc.circle(bubbleX + (bubbleSize/2), bubbleY + (bubbleSize/2), bubbleSize/3, 'F');
                        }
                    }
                });
                
                currentY += rowHeight;
            } else {
                // Questão dissertativa
                doc.setFont('helvetica', 'normal');
                doc.text(`${questionNum}. Dissertativa`, margin, currentY + 8);
                currentY += rowHeight;
            }
        });
        
        currentY += 30;
        
        // QUESTÕES
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('QUESTÕES:', margin, currentY);
        currentY += 25;
        
        studentQuestions.forEach((q, index) => {
            const questionNum = index + 1;
            
            // Verificar se precisa de nova página
            if (currentY > pageHeight - 100) {
                doc.addPage();
                currentY = margin;
            }
            
            // Título da questão
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`${questionNum}. ${q.title}`, margin, currentY);
            currentY += 20;
            
            // Conteúdo da questão (texto simples por enquanto)
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const content = q.content.replace(/<[^>]*>/g, ''); // Remove HTML tags
            const lines = doc.splitTextToSize(content, pageWidth - (margin * 2));
            doc.text(lines, margin, currentY);
            currentY += lines.length * 12;
            
            // Opções (se multiple choice)
            if (q.type === 'multiple_choice' && q.options) {
                currentY += 10;
                q.options.forEach((opt: any, optIndex: number) => {
                    const letter = String.fromCharCode(65 + optIndex);
                    const optionText = `${letter}) ${opt.text}`;
                    
                    if (includeAnswers && (Array.isArray(q.correct_answer) ? q.correct_answer.includes(opt.id) : opt.id === q.correct_answer)) {
                        doc.setFont('helvetica', 'bold');
                    } else {
                        doc.setFont('helvetica', 'normal');
                    }
                    
                    const optionLines = doc.splitTextToSize(optionText, pageWidth - (margin * 2));
                    doc.text(optionLines, margin + 15, currentY);
                    currentY += optionLines.length * 12;
                });
            }
            
            // Espaço para resposta dissertativa
            if (q.type === 'essay') {
                currentY += 10;
                const textLines = q.text_lines || 5;
                for (let i = 0; i < textLines; i++) {
                    doc.line(margin, currentY, pageWidth - margin, currentY);
                    currentY += 20;
                }
            }
            
            currentY += 15; // Espaço entre questões
        });
        
        // Gerar PDF como array buffer
        const pdfBuffer = doc.output('arraybuffer');
        console.log(`PDF gerado com sucesso para ${studentInfo.name}`);
        
        return new Uint8Array(pdfBuffer);
        
    } catch (error) {
        console.error('Erro ao gerar PDF com jsPDF:', error);
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
                    
                    // GERAR PDF COM JSPDF
                    const pdfBuffer = await generatePDFWithJsPDF(exam, studentQuestions, studentInfo, includeAnswers);
                    
                    // CALCULAR COORDENADAS DAS BOLHAS
                    const bubbleCoordinates = calculateBubbleCoordinates(studentQuestions, exam);
                    
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
                    
                    // Salvar no banco de dados - student_exams
                    const { error: dbError } = await supabase
                        .from('student_exams')
                        .upsert({
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
                    
                    results.push({
                        studentId: student.id,
                        studentName: student.name,
                        pdfUrl: urlData.publicUrl, // Na verdade é HTML por enquanto
                        bubbleCoordinates: Object.keys(bubbleCoordinates).length
                    });
                    
                    console.log(`✓ Concluído para ${student.name} - ${Object.keys(bubbleCoordinates).length} questões mapeadas`);
                    
                } catch (studentError) {
                    console.error(`Erro ao processar aluno ${student.name}:`, studentError);
                    results.push({
                        studentId: student.id,
                        studentName: student.name,
                        error: studentError.message
                    });
                }
            }
            
            console.log('=== GERAÇÃO EM LOTE CONCLUÍDA ===');
            console.log(`Processados: ${results.length} alunos`);
            console.log(`Sucessos: ${results.filter(r => !r.error).length}`);
            console.log(`Erros: ${results.filter(r => r.error).length}`);
            
            return new Response(JSON.stringify({
                success: true,
                message: 'Geração em lote concluída (HTMLs gerados)',
                results,
                totalStudents: students.length,
                successCount: results.filter(r => !r.error).length,
                errorCount: results.filter(r => r.error).length
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
        throw new Error("Parâmetros inválidos. Forneça 'studentExamId', 'examId' ou 'generateAll=true'.");
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