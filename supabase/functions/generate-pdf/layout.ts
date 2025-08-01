// supabase/functions/generate-pdf/layout.ts

// Interfaces para os dados
interface Question {
  id: string;
  title: string;
  content: any;
  type: string;
  points: number;
  options?: any[];
  correct_answer?: any;
}

interface ExamData {
  id: string;
  title: string;
  subject: string;
  institution?: string;
  total_points: number;
  exam_date: string | null;
  instructions?: string;
  layout?: string;
  exam_headers?: any; // Cabeçalho associado
  header?: any; // Alternativa para cabeçalho
}

interface StudentInfo {
  name?: string;
  id?: string;
  course?: string;
  class?: string;
  qrId?: string;
}

/**
 * Gera o HTML final da prova com base nos dados fornecidos.
 */
export function generateExamHTML(exam: ExamData, questions: Question[], version: number, includeAnswers: boolean, studentInfo?: StudentInfo): string {
    const header = exam.exam_headers || exam.header;
    const isDoubleColumn = exam.layout === 'double_column';
    const totalQuestions = questions.length;

    // Estilos CSS com todas as alterações
    const styles = `
        @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; margin: 0; padding: 1.5cm; color: #000; background-color: #fff; }
        .page-container { width: 100%; max-width: 18cm; margin: auto; }
        
        /* --- CSS do Cabeçalho Personalizado --- */
        .custom-header { display: flex; flex-direction: row; justify-content: space-between; align-items: stretch; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 25px; font-size: 11pt; line-height: 1.5; }
        .logo-container { flex: 0 0 80px; width: 80px; height: 80px; padding: 5px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; margin-right: 15px; }
        .logo-container img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .info-container { flex-grow: 1; }
        .info-container p { margin: 0 0 2px 0; }
        .info-container .institution-name { font-weight: bold; }
        .info-container .student-details { display: flex; justify-content: space-between; width: 80%; }
        .grade-container { flex: 0 0 100px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; margin-left: 15px; }
        .grade-box { border: 1px solid #000; padding: 20px 5px; text-align: center; font-weight: bold; flex-grow: 1; margin-bottom: 5px; }
        .date { font-size: 10pt; text-align: right; }
        .main-header, .info-grid, .student-info { display: none !important; }

        /* --- CSS do Gabarito --- */
        .answer-sheet-container { border: 1.5px solid #000; margin-bottom: 25px; display: flex; padding: 5px; }
        .qr-code-section { flex: 0 0 140px; padding: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .qr-code-section img { width: 120px; height: 120px; }
        .qr-code-section p { font-size: 9pt; text-align: center; margin-top: 5px; }
        .answer-grid-section { flex: 1; border-left: 1.5px solid #000; padding: 0 15px; display: flex; flex-direction: column; }
        .answer-grid-header { text-align: center; margin-bottom: 5px; font-size: 9pt; font-weight: bold; }
        .answer-grid-columns-container { display: flex; flex-direction: row; justify-content: space-around; flex: 1; }
        .answer-grid-column { display: flex; flex-direction: column; }
        .column-divider { width: 1.5px; background-color: #000; margin: 0 10px; }
        .answer-options-header { display: flex; margin-bottom: 2px; }
        .answer-options-header span { width: 18px; text-align: center; font-size: 9pt; font-weight: bold; }
        .answer-row { display: flex; align-items: center; margin-bottom: 2px; }
        .answer-row .q-number { font-weight: bold; margin-right: 5px; font-size: 10pt; width: 28px; }
        .answer-row .options-bubbles { display: flex; }
        .answer-row .bubble { width: 12px; height: 12px; border: 1px solid #999; border-radius: 50%; margin: 0 3px; }
        
        /* --- CSS das Questões --- */
        .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
        .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
        .question { padding-top: 15px; margin-top: 15px; border-top: 1px solid #999; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
        .questions-container > .question:first-child { padding-top: 0; margin-top: 0; border-top: none; }
        .question-header { font-weight: bold; margin-bottom: 8px; font-size: 11pt; }
        .question-content { text-align: justify; margin-bottom: 10px; widows: 3; orphans: 3; }
        .question-content img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
        .options-list { list-style-type: none; padding-left: 0; margin-top: 5px; }
        .option { margin-bottom: 6px; display: flex; align-items: flex-start; }
        .option-letter { font-weight: bold; margin-right: 8px; }
        .correct-answer-highlight { background-color: #cccccc; border-radius: 3px; padding: 1px 4px; }
        
        /* NOVO: CSS para o gabarito destacável do aluno */
        .student-answer-key {
            border-top: 2px dashed #999;
            padding-top: 15px;
            margin-top: 30px;
            text-align: center;
        }
        .student-answer-key .cut-line {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-size: 10pt;
            color: #555;
            margin-bottom: 10px;
        }
        .student-answer-key .key-grid {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 5px 15px;
            max-width: 100%;
        }
        .student-answer-key .key-item {
            font-size: 10pt;
        }
        
        /* Marcadores âncora APENAS na região do gabarito */
        .answer-sheet-container {
            position: relative;
        }
        
        /* Marcadores âncora principais nos cantos do gabarito */
        .anchor-marker {
            position: absolute;
            width: 8px;
            height: 8px;
            background-color: #000;
            border: 2px solid #000;
            border-radius: 50%;
            z-index: 20;
        }
        
        .top-left-anchor {
            top: 3px;
            left: 3px;
        }
        
        .top-right-anchor {
            top: 3px;
            right: 3px;
        }
        
        .bottom-left-anchor {
            bottom: 3px;
            left: 3px;
        }
        
        .bottom-right-anchor {
            bottom: 3px;
            right: 3px;
        }

        /* Marcadores de delimitação da área de respostas */
        .answer-area-marker {
            position: absolute;
            background-color: #000;
            z-index: 15;
        }
        
        /* Marcadores horizontais superior e inferior da grade */
        .answer-top-marker {
            width: 12px;
            height: 3px;
            top: 0px;
            left: 50%;
            transform: translateX(-50%);
        }
        
        .answer-bottom-marker {
            width: 12px;
            height: 3px;
            bottom: 0px;
            left: 50%;
            transform: translateX(-50%);
        }
        
        /* Marcadores verticais esquerdo e direito da grade */
        .answer-left-marker {
            width: 3px;
            height: 12px;
            left: 0px;
            top: 50%;
            transform: translateY(-50%);
        }
        
        .answer-right-marker {
            width: 3px;
            height: 12px;
            right: 0px;
            top: 50%;
            transform: translateY(-50%);
        }

        /* Marcadores de referência específicos para detecção */
        .detection-reference {
            position: absolute;
            width: 4px;
            height: 4px;
            background-color: #333;
            border-radius: 50%;
            z-index: 10;
        }
        
        .ref-q1 {
            top: 25px;
            left: 20px;
        }
        
        .ref-q5 {
            top: 85px;
            left: 20px;
        }
        
        .ref-q10 {
            top: 145px;
            left: 20px;
        }

        /* Exclusão do QR code da área de detecção */
        .qr-code-section {
            position: relative;
            z-index: 5; /* Menor que os marcadores */
        }
        
        .qr-code-section::after {
            content: "";
            position: absolute;
            top: -5px;
            left: -5px;
            right: -5px;
            bottom: -5px;
            border: 1px dashed #ccc;
            z-index: 1;
        }

        .page-footer { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 5px; }
        @media print { body { -webkit-print-color-adjust: exact; } }
    `;

    const generateAnswerGrid = () => {
        if (totalQuestions === 0) return '';
        const generateGridColumn = (start: number, end: number) => {
            let columnHTML = `<div class="answer-grid-column">`;
            columnHTML += `<div class="answer-options-header">${['a', 'b', 'c', 'd', 'e'].map(l => `<span>${l}</span>`).join('')}</div>`;
            for (let i = start; i <= end; i++) {
                columnHTML += `<div class="answer-row"><span class="q-number">Q.${i}:</span><div class="options-bubbles">${Array(5).fill('<div class="bubble"></div>').join('')}</div></div>`;
            }
            columnHTML += `</div>`;
            return columnHTML;
        };
        const numCols = totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3;
        const questionsPerColumn = Math.ceil(totalQuestions / numCols);
        let allColumnsHTML = `<div class="answer-grid-header">Marque o gabarito preenchendo completamente a região de cada alternativa.</div>`;
        allColumnsHTML += `<div class="answer-grid-columns-container">`;
        for (let i = 0; i < numCols; i++) {
            const start = (i * questionsPerColumn) + 1;
            const end = Math.min((i + 1) * questionsPerColumn, totalQuestions);
            if (start > end) continue;
            if (i > 0) {
                allColumnsHTML += `<div class="column-divider"></div>`;
            }
            allColumnsHTML += generateGridColumn(start, end);
        }
        allColumnsHTML += `</div>`;
        return allColumnsHTML;
    };

    // NOVA FUNÇÃO: Gera o gabarito destacável
    const generateStudentAnswerKey = () => {
        let keyHTML = `<div class="student-answer-key">`;
        keyHTML += `<div class="cut-line">&#9986; ----- Recorte e leve com você ----- &#9986;</div>`;
        keyHTML += `<div class="key-grid">`;
        for (let i = 1; i <= totalQuestions; i++) {
            keyHTML += `<div class="key-item"><strong>${i}.</strong> _____</div>`;
        }
        keyHTML += `</div></div>`;
        return keyHTML;
    };

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
            <div class="answer-sheet-container">
                <!-- Marcadores âncora PRINCIPAIS nos cantos do gabarito -->
                <div class="anchor-marker top-left-anchor"></div>
                <div class="anchor-marker top-right-anchor"></div>
                <div class="anchor-marker bottom-left-anchor"></div>
                <div class="anchor-marker bottom-right-anchor"></div>
                
                <div class="qr-code-section">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({
                        examId: exam.id,
                        studentId: studentInfo?.id || 'version-' + version,
                        version: version,
                        studentExamId: studentInfo?.qrId || null
                    }))}" alt="QR Code" />
                    <p>Prova: ${exam.id.split('-')[0]}.${studentInfo?.id || version}</p>
                </div>
                <div class="answer-grid-section" style="position: relative;">
                    <!-- Marcadores de delimitação da área de respostas -->
                    <div class="answer-area-marker answer-top-marker"></div>
                    <div class="answer-area-marker answer-bottom-marker"></div>
                    <div class="answer-area-marker answer-left-marker"></div>
                    <div class="answer-area-marker answer-right-marker"></div>
                    
                    <!-- Marcadores de referência para detecção -->
                    <div class="detection-reference ref-q1"></div>
                    <div class="detection-reference ref-q5"></div>
                    <div class="detection-reference ref-q10"></div>
                    
                    ${generateAnswerGrid()}
                </div>
            </div>
            
            <div class="custom-header">
                <div class="logo-container">
                    ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo Instituição">` : ''}
                </div>
                <div class="info-container">
                    <p class="institution-name">${header?.institution || 'Instituição de Ensino'}</p>
                    <p>Professor: ${header?.content?.professor || '_____________________'}</p>
                    <p>Disciplina: ${exam.subject}</p>
                    <p>Curso: ${studentInfo?.course || '___________________________________'}</p>
                    <p>Aluno: ${studentInfo?.name || '______________________________________________________'}</p>
                    <div class="student-details">
                        <span>Matrícula: ${studentInfo?.id || '_________________'}</span>
                        <span>Turma: ${studentInfo?.class || header?.content?.turma || '__'}</span>
                    </div>
                </div>
                <div class="grade-container">
                    <div class="grade-box">
                        Nota
                    </div>
                    <p class="date">Data: ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/______'}</p>
                </div>
            </div>

            ${exam.instructions ? `<div class="instructions"><strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}</div>` : ''}
            
            <div class="questions-container">
                ${questions.map((q, index) => {
                    let questionContent = typeof q.content === 'string' ? q.content : JSON.stringify(q.content);
                    let optionsHTML = '';
                    if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
                        optionsHTML = `<ol class="options-list">${q.options.map((opt: any, optIndex: number) => {
                            const isCorrect = includeAnswers && Array.isArray(q.correct_answer) && q.correct_answer.includes(opt.id);
                            return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}"><span class="option-letter">${String.fromCharCode(65 + optIndex)})</span><div>${opt.text}</div></li>`;
                        }).join('')}</ol>`;
                    }
                    return `<div class="question"><div class="question-header">Questão ${index + 1} (${q.points.toFixed(2)} pts)</div><div class="question-content">${questionContent}</div>${optionsHTML}</div>`;
                }).join('')}
            </div>

            ${generateStudentAnswerKey()}

            <div class="page-footer"><span>${exam.title} - V${version}</span><span>Página 1 de 1</span></div>
        </div>
    </body>
    </html>`;
}