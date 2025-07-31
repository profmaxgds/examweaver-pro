// supabase/functions/generate-pdf/layout.ts

// (As interfaces podem ser movidas para um arquivo de tipos compartilhado no futuro)
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
}

/**
 * Gera o HTML final da prova com base nos dados fornecidos.
 * Esta função é focada apenas na apresentação.
 */
export function generateExamHTML(exam: ExamData, questions: Question[], version: number, includeAnswers: boolean): string {
    const header = exam.exam_headers;
    const isDoubleColumn = exam.layout === 'double_column';
    const totalQuestions = questions.length;

    // Estilos CSS robustos e validados
    const styles = `
        @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; margin: 0; padding: 1.5cm; color: #000; background-color: #fff; }
        .page-container { width: 100%; max-width: 18cm; margin: auto; }
        .main-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
        .main-header img { max-height: 50px; margin-bottom: 10px; }
        .main-header .institution { font-size: 14pt; font-weight: bold; }
        .main-header .title { font-size: 16pt; font-weight: bold; margin-top: 10px; }
        .main-header .subtitle { font-size: 12pt; color: #333; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 15px; font-size: 10pt; padding: 10px 0; border-top: 1px solid #999; border-bottom: 1px solid #999; margin: 20px 0; }
        .student-info { border-top: 1px solid #999; border-bottom: 1px solid #999; padding: 10px 0; margin-bottom: 25px; font-size: 11pt; }
        .answer-sheet-container { border: 1.5px solid #000; margin-bottom: 25px; display: flex; padding: 5px; }
        .qr-code-section { flex: 0 0 140px; padding: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .qr-code-section img { width: 120px; height: 120px; }
        .qr-code-section p { font-size: 9pt; text-align: center; margin-top: 5px; }
        .answer-grid-section { flex: 1; border-left: 1.5px solid #000; padding-left: 15px; display: flex; flex-direction: column; }
        .answer-grid-header { text-align: center; margin-bottom: 5px; font-size: 9pt; font-weight: bold; }
        .answer-options-header { display: flex; margin-left: 28px; margin-bottom: 2px; }
        .answer-options-header span { width: 18px; text-align: center; font-size: 9pt; font-weight: bold; }
        .answer-row { display: flex; align-items: center; margin-bottom: 2px; }
        .answer-row .q-number { font-weight: bold; margin-right: 5px; font-size: 10pt; width: 28px; }
        .answer-row .options-bubbles { display: flex; }
        .answer-row .bubble { width: 12px; height: 12px; border: 1px solid #999; border-radius: 50%; margin: 0 3px; }
        .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
        .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
        .question { margin-bottom: 18px; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
        .question-header { font-weight: bold; margin-bottom: 8px; font-size: 11pt; }
        .question-content { text-align: justify; margin-bottom: 10px; }
        .options-list { list-style-type: none; padding-left: 0; margin-top: 5px; }
        .option { margin-bottom: 6px; display: flex; align-items: flex-start; }
        .option-letter { font-weight: bold; margin-right: 8px; }
        .correct-answer-highlight { background-color: #cccccc; border-radius: 3px; padding: 1px 4px; }
        .page-footer { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 5px; }
        @media print { body { -webkit-print-color-adjust: exact; } }
    `;

    const generateAnswerGrid = () => {
        let grid = `<div class="answer-grid-header">Marque o gabarito preenchendo completamente a região de cada alternativa.</div>`;
        grid += `<div class="answer-options-header">${['a', 'b', 'c', 'd', 'e'].map(l => `<span>${l}</span>`).join('')}</div>`;
        for (let i = 1; i <= totalQuestions; i++) {
            grid += `<div class="answer-row"><span class="q-number">Q.${i}:</span><div class="options-bubbles">${Array(5).fill('<div class="bubble"></div>').join('')}</div></div>`;
        }
        return grid;
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
                <div class="qr-code-section">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=examId:${exam.id},version:${version}" alt="QR Code" />
                    <p>Prova: ${exam.id.split('-')[0]}.${version}</p>
                </div>
                <div class="answer-grid-section">${generateAnswerGrid()}</div>
            </div>
            <div class="main-header">
                ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo">` : ''}
                <div class="institution">${header?.institution || exam.institution || 'Instituição de Ensino'}</div>
                ${header?.content?.subtitle ? `<div class="subtitle">${header.content.subtitle}</div>` : ''}
                <div class="title">${exam.title}</div>
            </div>
            <div class="info-grid">
                <div><strong>Disciplina:</strong> ${exam.subject}</div>
                <div><strong>Professor(a):</strong> ${header?.content?.professor || '__________________'}</div>
                <div><strong>Data:</strong> ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/______'}</div>
                <div><strong>Valor:</strong> ${exam.total_points.toFixed(2)} pontos</div>
            </div>
            <div class="student-info"><div class="student-field"><strong>Aluno(a):</strong> __________________________________________________________________</div></div>
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
            <div class="page-footer"><span>${exam.title} - V${version}</span><span>Página 1 de 1</span></div>
        </div>
    </body>
    </html>`;
}