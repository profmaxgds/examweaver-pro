interface Question {
  id: string;
  title: string;
  content: any;
  type: 'multiple_choice' | 'true_false' | 'essay';
  points: number;
  options?: any[];
  correct_answer?: any;
  text_lines?: number;
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
  exam_headers?: any;
  header?: any;
  professor_name?: string;
}

interface StudentInfo {
  name?: string;
  id?: string;
  course?: string;
  class?: string;
  qrId?: string;
}

interface QRCode {
  data: string;
  version: number;
  studentId: string;
}

interface AnswerSheet {
  questions: Question[];
  version: number;
  includeAnswers: boolean;
}

export function generateExamHTML(exam: ExamData, questions: Question[], version: number, includeAnswers: boolean, studentInfo?: StudentInfo): string {
    console.log('=== generateExamHTML CHAMADO ===');
    console.log(`Exam title: ${exam?.title || 'N/A'}`);
    console.log(`Questions count: ${questions?.length || 0}`);
    console.log(`Version: ${version}, Include answers: ${includeAnswers}`);
    console.log(`Student info:`, studentInfo?.name || 'N/A');
    
    if (!exam || !questions || questions.length === 0) {
        console.error('ERRO: Dados inválidos passados para generateExamHTML');
        console.error('Exam:', exam);
        console.error('Questions:', questions);
        return `
        <!DOCTYPE html>
        <html><head><title>Erro</title></head>
        <body>
            <h1>Erro na geração da prova</h1>
            <p>Dados inválidos: exam=${!!exam}, questions=${questions?.length || 0}</p>
        </body></html>
        `;
    }
    
    const header = exam.exam_headers || exam.header;
    const isDoubleColumn = exam.layout === 'double_column';
    const totalQuestions = questions.length;
    const qrCodeData: QRCode = {
        data: JSON.stringify({
            examId: exam.id,
            studentId: studentInfo?.id || 'version-' + version,
            studentName: studentInfo?.name || 'Estudante',
            version: version,
            studentExamId: studentInfo?.qrId || null,
            examTitle: exam.title,
            subject: exam.subject,
            totalQuestions: totalQuestions,
            totalPoints: exam.total_points,
            institution: exam.institution || header?.institution,
            professor: exam.professor_name || header?.content?.professor,
            examDate: exam.exam_date,
            course: studentInfo?.course,
            class: studentInfo?.class
        }),
        version: version,
        studentId: studentInfo?.id || version.toString()
    };

    const styles = `
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono&family=Times+New+Roman&display=swap');
        
        *, *::before, *::after {
            box-sizing: border-box;
        }

        :root {
            --font-main: 'Times New Roman', Times, serif;
            --font-mono: 'Roboto Mono', monospace;
            --bubble-size: 14px;
            --bubble-margin: 0 6px;
            --bubble-border: 1px solid #000;
            --anchor-size: 14px;
            --anchor-margin: 0 5px;
            --q-number-width: 30px;
            --q-number-margin-right: 10px;
            --total-left-spacing: calc(var(--q-number-width) + var(--q-number-margin-right));
        }

        body { 
            font-family: var(--font-main); 
            font-size: 11pt; 
            line-height: 1.3; 
            margin: 0; 
            padding: 1.5cm; 
            color: #000; 
            background-color: #fff; 
        }
        .page-container { 
            width: 100%; 
            max-width: 18cm; 
            margin: auto; 
        }
        
        .custom-header { 
            display: flex; 
            flex-direction: row; 
            justify-content: space-between; 
            align-items: stretch; 
            border-bottom: 1px solid #000;
            padding-bottom: 10px; 
            margin-bottom: 15px; 
            font-size: 11pt; 
            line-height: 1.3; 
        }
        .logo-container { 
            flex: 0 0 80px; 
            width: 80px; 
            height: 80px; 
            padding: 5px; 
            border: 1px solid #000; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            margin-right: 15px; 
        }
        .logo-container img { 
            max-width: 100%; 
            max-height: 100%; 
            object-fit: contain; 
        }
        .info-container { 
            flex-grow: 1; 
        }
        .info-container p { 
            margin: 0 0 2px 0; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            white-space: nowrap; 
        }
        .info-container .institution-name { 
            font-weight: bold; 
        }
        .info-container .row-layout { 
            display: flex; 
            gap: 10px; 
            align-items: center; 
        }
        .info-container .uppercase { 
            text-transform: uppercase; 
        }
        .info-container .student-details { 
            display: flex; 
            flex-direction: row; 
            gap: 10px; 
            align-items: center; 
        }
        .grade-container { 
            flex: 0 0 100px; 
            display: flex; 
            flex-direction: column; 
            justify-content: space-between; 
            text-align: right; 
            margin-left: 15px; 
            gap: 2px;
        }
        .grade-box { 
            border: 1px solid #000; 
            padding: 20px 5px; 
            text-align: center; 
            font-weight: bold; 
            flex-grow: 1; 
            margin-bottom: 0;
        }
        .date { 
            font-size: 10pt; 
            text-align: right; 
            margin: 0;
        }
        .main-header, .info-grid, .student-info { 
            display: none !important; 
        }

        .answer-sheet-header { 
            font-family: var(--font-mono);
            font-size: 12pt; 
            font-weight: bold; 
            margin-bottom: 15px; 
            text-align: center; 
        }

        .answer-sheet-container { 
            font-family: var(--font-mono);
            margin: 80px 0 80px 0;
            display: flex; 
            flex-direction: column; 
            align-items: center; 
        }
        .qr-code-section { 
            flex: 0 0 120px; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            margin-right: 20px; 
        }
        .qr-code-section img { 
            width: 100px; 
            height: 100px; 
            margin-bottom: 5px; 
        }
        .qr-code-section p { 
            font-size: 9pt; 
            text-align: center; 
        }
        .answer-grid-section { 
            position: relative; 
            display: flex; 
            flex-direction: column; 
            align-items: flex-start; 
            padding: var(--anchor-size) 0; 
        }
        .answer-grid { 
            display: flex; 
            flex-direction: column; 
            align-items: flex-start; 
        }
        .answer-row { 
            display: flex; 
            align-items: center; 
            margin-bottom: 8px; 
        }
        .answer-row .q-number { 
            font-weight: bold; 
            font-size: 10pt; 
            text-align: right; 
            width: var(--q-number-width); 
            margin-right: var(--q-number-margin-right); 
        }
        .answer-row .options-bubbles { 
            display: flex; 
            align-items: center; 
        }
        .answer-row .bubble { 
            width: var(--bubble-size); 
            height: var(--bubble-size); 
            border: var(--bubble-border); 
            margin: var(--bubble-margin); 
            background-color: white; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 9pt; 
            line-height: 1.1; 
        }
        .answer-row .bubble.correct-answer { 
            background-color: #000 !important; 
            -webkit-print-color-adjust: exact !important; 
            color: #000; 
        }
        .answer-row .essay-indicator { 
            font-family: var(--font-main); 
            font-size: 9pt; 
            color: #555; 
            font-style: italic; 
            margin-left: 5px; 
        }
        .anchor-top-left, .anchor-top-right, .anchor-bottom-left, .anchor-bottom-right { 
            position: absolute; 
            width: var(--anchor-size); 
            height: var(--anchor-size); 
            background-color: #000; 
            box-shadow: 0 0 0 5px #fff, 0 0 0 7px #000;
            border-radius: 50%;
        }

        
        .anchor-top-left { top: -15px; left: -15px; }
        .anchor-top-right { top: -15px; right: -15px; }
        .anchor-bottom-left { bottom: -15px; left: -15px; }
        .anchor-bottom-right { bottom: -15px; right: -15px; }

        .instructions { 
            margin-bottom: 15px; 
            text-align: justify; 
            font-size: 10pt; 
            color: #444; 
            border: 1px solid #ddd; 
            padding: 10px; 
            border-radius: 5px; 
        }
        .questions-container { 
            column-count: ${isDoubleColumn ? 2 : 1}; 
            column-gap: 1.5cm; 
        }
        .question { 
            padding-top: 10px; 
            margin-top: 10px; 
            border-top: 1px solid #999; 
            page-break-inside: avoid; 
            -webkit-column-break-inside: avoid; 
            break-inside: avoid; 
            line-height: 1.3; 
        }
        .questions-container > .question:first-child { 
            padding-top: 0; 
            margin-top: 0; 
            border-top: none; 
        }
        .question-header { 
            font-weight: bold; 
            margin-bottom: 6px; 
            font-size: 11pt; 
        }
        .question-content { 
            text-align: justify; 
            margin-bottom: 8px; 
            widows: 3; 
            orphans: 3; 
            line-height: 1.3; 
        }
        .question-content img { 
            max-width: 100%; 
            height: auto; 
            display: block; 
            margin: 10px 0; 
        }
        .options-list { 
            list-style-type: none; 
            padding-left: 0; 
            margin-top: 5px; 
            line-height: 1.3; 
        }
        .option { 
            margin-bottom: 6px; 
            display: flex; 
            align-items: flex-start; 
            line-height: 1.3; 
        }
        .option-letter { 
            font-weight: bold; 
            margin-right: 8px; 
            min-width: 20px; 
            display: inline-block;
            line-height: 1.3; 
        }
        .option-text { 
            flex: 1; 
            line-height: 1.3; 
        }
        .correct-answer-highlight { 
            background-color: #cccccc; 
            border-radius: 3px; 
            padding: 1px 4px; 
        }
        .essay-lines { 
            margin-top: 8px; 
            width: 100%; 
        }
        .essay-line { 
            border-bottom: 1px solid #999; 
            margin-bottom: 2mm; 
            height: 7mm; 
            width: 100%; 
        }
        .student-answer-key { 
            border-top: 2px dashed #999; 
            padding-top: 15px; 
            margin-top: 20px; 
            text-align: center; 
        }
        .student-answer-key .cut-line { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            gap: 20px; 
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
        .student-answer-key .essay-key-item { 
            font-size: 9pt; 
            color: #555; 
            font-style: italic; 
        }
        .page-footer { 
            display: flex; 
            justify-content: space-between; 
            font-size: 10pt; 
            margin-top: 20px; 
            border-top: 1px solid #ccc; 
            padding-top: 5px; 
        }
        
        @media print { 
            body { -webkit-print-color-adjust: exact; }
            .anchor-top-left, .anchor-top-right, .anchor-bottom-left, .anchor-bottom-right, .correct-answer-highlight { 
                -webkit-print-color-adjust: exact !important; 
                color-adjust: exact !important; 
            }
        }
    `;

    const generateQRCode = (qrCodeData: QRCode): string => {
        return `
            <div class="qr-code-section">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrCodeData.data)}" alt="QR Code" />
                <p>Prova: ${exam.id.split('-')[0]}.${qrCodeData.studentId}</p>
            </div>
        `;
    };

    const generateAnswerSheet = (questions: Question[], version: number, includeAnswers: boolean): string => {
        let gridHTML = '<div class="answer-grid">';
        questions.forEach((q, index) => {
            const questionNumber = String(index + 1).padStart(2, '0');
            const isEssay = q.type === 'essay';
            let options: string[];

            if (isEssay) {
                options = [];
            } else if (q.type === 'true_false') {
                options = ['V', 'F'];
            } else if (Array.isArray(q.options)) {
                options = q.options.map((_, i) => String.fromCharCode(65 + i));
            } else {
                options = Array.from({ length: 5 }, (_, i) => String.fromCharCode(65 + i));
            }

            gridHTML += `<div class="answer-row">`;
            gridHTML += `<span class="q-number">${questionNumber}.</span>`;
            if (isEssay) {
                gridHTML += `<span class="essay-indicator">Dissertativa</span>`;
            } else {
                gridHTML += `<div class="options-bubbles">`;
                options.forEach((letter, i) => {
                    let isCorrectAnswer = false;
                    if (includeAnswers && q) {
                        if (q.type === 'multiple_choice') {
                            const correctOption = q.options?.find((opt: any) => 
                                Array.isArray(q.correct_answer) ? q.correct_answer.includes(opt.id) : opt.id === q.correct_answer
                            );
                            isCorrectAnswer = correctOption && Array.isArray(q.options) && i < q.options.length && q.options[i].id === correctOption.id;
                        } else if (q.type === 'true_false') {
                            isCorrectAnswer = (i === 0 && q.correct_answer === true) || (i === 1 && q.correct_answer === false);
                        }
                    }
                    const bubbleClass = isCorrectAnswer ? 'bubble correct-answer' : 'bubble';
                    gridHTML += `<div class="${bubbleClass}">${letter}</div>`;
                });
                gridHTML += `</div>`;
            }
            gridHTML += `</div>`;
        });
        gridHTML += '</div>';
        return gridHTML;
    };

    const generateStudentAnswerKey = () => {
        let keyHTML = `<div class="student-answer-key">`;
        keyHTML += `<div class="cut-line">&#9986; ----- Recorte e leve com você ----- &#9986;</div>`;
        keyHTML += `<div class="key-grid">`;
        for (let i = 1; i <= totalQuestions; i++) {
            const q = questions[i - 1];
            const questionNumber = String(i).padStart(2, '0');
            if (q.type === 'essay') {
                keyHTML += `<div class="key-item essay-key-item"><strong>${questionNumber}.</strong> Dissertativa</div>`;
            } else {
                keyHTML += `<div class="key-item"><strong>${questionNumber}.</strong> _____</div>`;
            }
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
            <div class="custom-header">
                <div class="logo-container">
                    ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo Instituição">` : ''}
                </div>
                <div class="info-container">
                    <p class="institution-name">${header?.institution || 'Instituição de Ensino'}</p>
                    <div class="row-layout">
                        <p>Professor: <span class="uppercase">${(exam.professor_name || header?.content?.professor || '').toUpperCase() || '_____________________'} </span></p>
                        <p>Disciplina: <span class="uppercase">${(exam.subject || '').toUpperCase() || '_____________________'} </span></p>
                    </div>
                    <div class="row-layout">
                        <p>Curso: <span class="uppercase">${(studentInfo?.course || '').toUpperCase() || '_____________________'} </span></p>
                        <p>Turma: <span class="uppercase">${(studentInfo?.class || header?.content?.turma || '').toUpperCase() || '__'} </span></p>
                    </div>
                    <div class="student-details">
                        <p>Matrícula: <span class="uppercase">${(studentInfo?.id || '').toUpperCase() || '_________________'} </span></p>
                        <p>Aluno: <span class="uppercase">${(studentInfo?.name || '').toUpperCase() || '______________________________________________________'} </span></p>
                    </div>
                </div>
                <div class="grade-container">
                    <div class="grade-box">
                        Nota
                    </div>
                    <p class="date">Data: ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/______'}</p>
                </div>
            </div>
            <div class="answer-sheet-header">GABARITO: Preencha completamente a alternativa correta.</div>

            <div class="answer-sheet-container">
                <div style="display: flex; align-items: center; gap: 20px;">
                    ${generateQRCode(qrCodeData)}
                    <div class="answer-grid-section">
                        ${generateAnswerSheet(questions, version, includeAnswers)}
                        <div class="anchor-top-left"></div>
                        <div class="anchor-top-right"></div>
                        <div class="anchor-bottom-left"></div>
                        <div class="anchor-bottom-right"></div>
                    </div>
                </div>
            </div>

            ${exam.instructions ? `<div class="instructions"><strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}</div>` : ''}
            
            <div class="questions-container">
                ${questions.map((q, index) => {
                    const questionNumber = String(index + 1).padStart(2, '0');
                    let questionContent = typeof q.content === 'string' ? q.content : JSON.stringify(q.content);
                    let optionsHTML = '';
                    if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
                        optionsHTML = `<ol class="options-list">${q.options.map((opt: any, optIndex: number) => {
                            const isCorrect = includeAnswers && Array.isArray(q.correct_answer) && q.correct_answer.includes(opt.id);
                            return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}">
                                <span class="option-letter">${String.fromCharCode(65 + optIndex)})</span>
                                <div class="option-text">${opt.text}</div>
                            </li>`;
                        }).join('')}</ol>`;
                    } else if (q.type === 'true_false') {
                        optionsHTML = `<ol class="options-list">${['Verdadeiro', 'Falso'].map((opt, optIndex) => {
                            const isCorrect = includeAnswers && q.correct_answer === (optIndex === 0 ? true : false);
                            return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}">
                                <span class="option-letter">${optIndex === 0 ? 'V' : 'F'})</span>
                                <div class="option-text">${opt}</div>
                            </li>`;
                        }).join('')}</ol>`;
                    } else if (q.type === 'essay') {
                        const numLines = q.text_lines || 5;
                        optionsHTML = `<div class="essay-lines">${Array(numLines).fill('').map(() => `<div class="essay-line"></div>`).join('')}</div>`;
                    }
                    return `<div class="question">
                        <div class="question-header">Questão ${questionNumber} (${q.points?.toFixed ? q.points.toFixed(2) : q.points || 1} pts)</div>
                        <div class="question-content">${questionContent}</div>
                        ${optionsHTML}
                    </div>`;
                }).join('')}
            </div>

            ${generateStudentAnswerKey()}

            <div class="page-footer"><span>${exam.title} - V${version}</span><span>Página 1 de 1</span></div>
        </div>
    </body>
    </html>`;
}