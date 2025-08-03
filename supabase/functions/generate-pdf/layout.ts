// // // supabase/functions/generate-pdf/layout.ts

// // // Interfaces para os dados
// // interface Question {
// //   id: string;
// //   title: string;
// //   content: any;
// //   type: 'multiple_choice' | 'true_false' | 'essay';
// //   points: number;
// //   options?: any[];
// //   correct_answer?: any;
// //   text_lines?: number; // Número de linhas para questões dissertativas
// // }

// // interface ExamData {
// //   id: string;
// //   title: string;
// //   subject: string;
// //   institution?: string;
// //   total_points: number;
// //   exam_date: string | null;
// //   instructions?: string;
// //   layout?: string;
// //   exam_headers?: any; // Cabeçalho associado
// //   header?: any; // Alternativa para cabeçalho
// //   professor_name?: string;
// // }

// // interface StudentInfo {
// //   name?: string;
// //   id?: string;
// //   course?: string;
// //   class?: string;
// //   qrId?: string;
// // }

// // /**
// //  * Gera o HTML final da prova com base nos dados fornecidos.
// //  */
// // export function generateExamHTML(exam: ExamData, questions: Question[], version: number, includeAnswers: boolean, studentInfo?: StudentInfo): string {
// //     const header = exam.exam_headers || exam.header;
// //     const isDoubleColumn = exam.layout === 'double_column';
// //     const totalQuestions = questions.length;

// //     // Estilos CSS atualizados
// //     const styles = `
// //         @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
// //         body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; margin: 0; padding: 1.5cm; color: #000; background-color: #fff; }
// //         .page-container { width: 100%; max-width: 18cm; margin: auto; }
        
// //         /* --- CSS do Cabeçalho Personalizado --- */
// //         .custom-header { display: flex; flex-direction: row; justify-content: space-between; align-items: stretch; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 25px; font-size: 11pt; line-height: 1.5; }
// //         .logo-container { flex: 0 0 80px; width: 80px; height: 80px; padding: 5px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; margin-right: 15px; }
// //         .logo-container img { max-width: 100%; max-height: 100%; object-fit: contain; }
// //         .info-container { flex-grow: 1; }
// //         .info-container p { margin: 0 0 2px 0; }
// //         .info-container .institution-name { font-weight: bold; }
// //         .info-container .student-details { display: flex; justify-content: space-between; width: 80%; }
// //         .grade-container { flex: 0 0 100px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; margin-left: 15px; }
// //         .grade-box { border: 1px solid #000; padding: 20px 5px; text-align: center; font-weight: bold; flex-grow: 1; margin-bottom: 5px; }
// //         .date { font-size: 10pt; text-align: right; }
// //         .main-header, .info-grid, .student-info { display: none !important; }

// //         /* --- CSS do Gabarito --- */
// //         .answer-sheet-container { border: 1.5px solid #000; margin-bottom: 25px; display: flex; padding: 5px; min-height: 200px; }
// //         .qr-code-section { flex: 0 0 140px; padding: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
// //         .qr-code-section img { width: 120px; height: 120px; }
// //         .qr-code-section p { font-size: 9pt; text-align: center; margin-top: 5px; }
// //         .answer-grid-section { flex: 1; border-left: 1.5px solid #000; padding: 0 20px; display: flex; flex-direction: column; min-height: 180px; position: relative; }
// //         .answer-grid-header { text-align: center; margin-bottom: 8px; font-size: 9pt; font-weight: bold; padding-top: 15px; }
// //         .answer-grid-columns-container { display: flex; flex-direction: row; justify-content: space-around; flex: 1; padding: 15px 25px; }
// //         .answer-grid-column { display: flex; flex-direction: column; }
// //         .column-divider { width: 1.5px; background-color: #000; margin: 0 10px; }
// //         .answer-options-header { display: flex; margin-bottom: 4px; padding-left: 28px; }
// //         .answer-options-header span { width: 16px; text-align: center; font-size: 9pt; font-weight: bold; margin: 0 2px; }
// //         .answer-row { display: flex; align-items: center; margin-bottom: 3px; }
// //         .answer-row .q-number { font-weight: bold; margin-right: 6px; font-size: 10pt; width: 26px; text-align: left; }
// //         .answer-row .options-bubbles { display: flex; align-items: center; }
// //         .answer-row .bubble { width: 11px; height: 11px; border: 1px solid #999; border-radius: 50%; margin: 0 2.5px; }
// //         .answer-row .essay-indicator { font-size: 9pt; color: #555; font-style: italic; }
        
// //         /* --- CSS das Questões --- */
// //         .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
// //         .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
// //         .question { padding-top: 15px; margin-top: 15px; border-top: 1px solid #999; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
// //         .questions-container > .question:first-child { padding-top: 0; margin-top: 0; border-top: none; }
// //         .question-header { font-weight: bold; margin-bottom: 8px; font-size: 11pt; }
// //         .question-content { text-align: justify; margin-bottom: 10px; widows: 3; orphans: 3; }
// //         .question-content img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
// //         .options-list { list-style-type: none; padding-left: 0; margin-top: 5px; }
// //         .option { margin-bottom: 8px; display: flex; align-items: flex-start; }
// //         .option-letter { font-weight: bold; margin-right: 8px; min-width: 20px; display: inline-block; }
// //         .option-text { flex: 1; line-height: 1.4; }
// //         .correct-answer-highlight { background-color: #cccccc; border-radius: 3px; padding: 1px 4px; }
        
// //         /* CSS para questões dissertativas */
// //         .essay-lines { margin-top: 10px; width: 100%; }
// //         .essay-line { border-bottom: 1px solid #999; margin-bottom: 2mm; height: 7mm; width: 100%; }
        
// //         /* CSS para o gabarito destacável do aluno */
// //         .student-answer-key { border-top: 2px dashed #999; padding-top: 15px; margin-top: 30px; text-align: center; }
// //         .student-answer-key .cut-line { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 10pt; color: #555; margin-bottom: 10px; }
// //         .student-answer-key .key-grid { display: inline-flex; flex-wrap: wrap; gap: 5px 15px; max-width: 100%; }
// //         .student-answer-key .key-item { font-size: 10pt; }
// //         .student-answer-key .essay-key-item { font-size: 9pt; color: #555; font-style: italic; }
        
// //         /* Container da folha de respostas */
// //         .answer-sheet-container { position: relative; }
// //         .answer-grid-section { position: relative; }
// //         .anchor-marker { position: absolute; width: 8px; height: 8px; background-color: #000; border: 2px solid #000; border-radius: 50%; z-index: 20; }
// //         .grid-top-left-anchor { top: 8px; left: 8px; }
// //         .grid-top-right-anchor { top: 8px; right: 8px; }
// //         .grid-bottom-left-anchor { bottom: 8px; left: 8px; }
// //         .grid-bottom-right-anchor { bottom: 8px; right: 8px; }
// //         .answer-area-marker { position: absolute; background-color: #000; z-index: 15; }
// //         .answer-top-marker { width: 12px; height: 3px; top: 15px; left: 50%; transform: translateX(-50%); }
// //         .answer-bottom-marker { width: 12px; height: 3px; bottom: 5px; left: 50%; transform: translateX(-50%); }
// //         .answer-left-marker { width: 3px; height: 12px; left: 15px; top: 50%; transform: translateY(-50%); }
// //         .answer-right-marker { width: 3px; height: 12px; right: 15px; top: 50%; transform: translateY(-50%); }
// //         .detection-reference { position: absolute; width: 4px; height: 4px; background-color: #333; border-radius: 50%; z-index: 10; }
// //         .ref-q1 { top: 35px; left: 25px; }
// //         .ref-q5 { top: 95px; left: 25px; }
// //         .ref-q10 { top: 155px; left: 25px; }
// //         .qr-code-section { position: relative; z-index: 5; }
// //         .page-footer { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 5px; }
// //         @media print { 
// //             body { -webkit-print-color-adjust: exact; }
// //             .anchor-marker, .answer-area-marker, .detection-reference { 
// //                 -webkit-print-color-adjust: exact !important; 
// //                 color-adjust: exact !important; 
// //             }
// //         }
// //     `;

// //     const generateAnswerGrid = () => {
// //         if (totalQuestions === 0) return '';
// //         const generateGridColumn = (start: number, end: number) => {
// //             let columnHTML = `<div class="answer-grid-column">`;
// //             const questionsInColumn = questions.slice(start - 1, end);
// //             // Determinar opções com base nas questões da coluna
// //             const hasMultipleChoice = questionsInColumn.some(q => q.type === 'multiple_choice');
// //             const options = hasMultipleChoice ? ['A', 'B', 'C', 'D', 'E'] : ['V', 'F'];
// //             columnHTML += `<div class="answer-options-header">${options.map(l => `<span>${l}</span>`).join('')}</div>`;
// //             for (let i = start; i <= end; i++) {
// //                 const q = questions[i - 1];
// //                 if (q.type === 'essay') {
// //                     columnHTML += `<div class="answer-row"><span class="q-number">Q.${i}:</span><span class="essay-indicator">Dissertativa</span></div>`;
// //                 } else {
// //                     const numOptions = q.type === 'true_false' ? 2 : 5;
// //                     columnHTML += `<div class="answer-row"><span class="q-number">Q.${i}:</span><div class="options-bubbles">${Array(numOptions).fill('<div class="bubble"></div>').join('')}</div></div>`;
// //                 }
// //             }
// //             columnHTML += `</div>`;
// //             return columnHTML;
// //         };
// //         const numCols = totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3;
// //         const questionsPerColumn = Math.ceil(totalQuestions / numCols);
// //         let allColumnsHTML = `<div class="answer-grid-header">Marque o gabarito preenchendo completamente a região de cada alternativa. Questões dissertativas devem ser respondidas no espaço fornecido.</div>`;
// //         allColumnsHTML += `<div class="answer-grid-columns-container">`;
// //         for (let i = 0; i < numCols; i++) {
// //             const start = (i * questionsPerColumn) + 1;
// //             const end = Math.min((i + 1) * questionsPerColumn, totalQuestions);
// //             if (start > end) continue;
// //             if (i > 0) {
// //                 allColumnsHTML += `<div class="column-divider"></div>`;
// //             }
// //             allColumnsHTML += generateGridColumn(start, end);
// //         }
// //         allColumnsHTML += `</div>`;
// //         return allColumnsHTML;
// //     };

// //     const generateStudentAnswerKey = () => {
// //         let keyHTML = `<div class="student-answer-key">`;
// //         keyHTML += `<div class="cut-line">&#9986; ----- Recorte e leve com você ----- &#9986;</div>`;
// //         keyHTML += `<div class="key-grid">`;
// //         for (let i = 1; i <= totalQuestions; i++) {
// //             const q = questions[i - 1];
// //             if (q.type === 'essay') {
// //                 keyHTML += `<div class="key-item essay-key-item"><strong>${i}.</strong> Dissertativa</div>`;
// //             } else {
// //                 keyHTML += `<div class="key-item"><strong>${i}.</strong> _____</div>`;
// //             }
// //         }
// //         keyHTML += `</div></div>`;
// //         return keyHTML;
// //     };

// //     return `
// //     <!DOCTYPE html>
// //     <html lang="pt-BR">
// //     <head>
// //         <meta charset="UTF-8">
// //         <title>${exam.title} - V${version}</title>
// //         <style>${styles}</style>
// //     </head>
// //     <body>
// //         <div class="page-container">
// //             <div class="answer-sheet-container">
// //                 <div class="qr-code-section">
// //                     <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({
// //                         examId: exam.id,
// //                         studentId: studentInfo?.id || 'version-' + version,
// //                         version: version,
// //                         studentExamId: studentInfo?.qrId || null
// //                     }))}" alt="QR Code" />
// //                     <p>Prova: ${exam.id.split('-')[0]}.${studentInfo?.id || version}</p>
// //                 </div>
// //                 <div class="answer-grid-section">
// //                     <div class="anchor-marker grid-top-left-anchor"></div>
// //                     <div class="anchor-marker grid-top-right-anchor"></div>
// //                     <div class="anchor-marker grid-bottom-left-anchor"></div>
// //                     <div class="anchor-marker grid-bottom-right-anchor"></div>
// //                     <div class="answer-area-marker answer-top-marker"></div>
// //                     <div class="answer-area-marker answer-bottom-marker"></div>
// //                     <div class="answer-area-marker answer-left-marker"></div>
// //                     <div class="answer-area-marker answer-right-marker"></div>
// //                     <div class="detection-reference ref-q1"></div>
// //                     <div class="detection-reference ref-q5"></div>
// //                     <div class="detection-reference ref-q10"></div>
// //                     ${generateAnswerGrid()}
// //                 </div>
// //             </div>
            
// //             <div class="custom-header">
// //                 <div class="logo-container">
// //                     ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo Instituição">` : ''}
// //                 </div>
// //                 <div class="info-container">
// //                     <p class="institution-name">${header?.institution || 'Instituição de Ensino'}</p>
// //                     <p>Professor: ${exam.professor_name || header?.content?.professor || '_____________________'}</p>
// //                     <p>Disciplina: ${exam.subject}</p>
// //                     <p>Curso: ${studentInfo?.course || '___________________________________'}</p>
// //                     <p>Aluno: ${studentInfo?.name || '______________________________________________________'}</p>
// //                     <div class="student-details">
// //                         <span>Matrícula: ${studentInfo?.id || '_________________'}</span>
// //                         <span>Turma: ${studentInfo?.class || header?.content?.turma || '__'}</span>
// //                     </div>
// //                 </div>
// //                 <div class="grade-container">
// //                     <div class="grade-box">
// //                         Nota
// //                     </div>
// //                     <p class="date">Data: ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/______'}</p>
// //                 </div>
// //             </div>

// //             ${exam.instructions ? `<div class="instructions"><strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}</div>` : ''}
            
// //             <div class="questions-container">
// //                 ${questions.map((q, index) => {
// //                     let questionContent = typeof q.content === 'string' ? q.content : JSON.stringify(q.content);
// //                     let optionsHTML = '';
// //                     if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
// //                         optionsHTML = `<ol class="options-list">${q.options.map((opt: any, optIndex: number) => {
// //                             const isCorrect = includeAnswers && Array.isArray(q.correct_answer) && q.correct_answer.includes(opt.id);
// //                             return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}">
// //                                 <span class="option-letter">${String.fromCharCode(65 + optIndex)})</span>
// //                                 <div class="option-text">${opt.text}</div>
// //                             </li>`;
// //                         }).join('')}</ol>`;
// //                     } else if (q.type === 'true_false') {
// //                         optionsHTML = `<ol class="options-list">${['Verdadeiro', 'Falso'].map((opt, optIndex) => {
// //                             const isCorrect = includeAnswers && q.correct_answer === (optIndex === 0 ? true : false);
// //                             return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}">
// //                                 <span class="option-letter">${optIndex === 0 ? 'V' : 'F'})</span>
// //                                 <div class="option-text">${opt}</div>
// //                             </li>`;
// //                         }).join('')}</ol>`;
// //                     } else if (q.type === 'essay') {
// //                         const numLines = q.text_lines || 5; // Padrão de 5 linhas se não especificado
// //                         const lineWidth = isDoubleColumn ? '100%' : '100%'; // Ajustar para layout
// //                         optionsHTML = `<div class="essay-lines">${Array(numLines).fill().map(() => `<div class="essay-line"></div>`).join('')}</div>`;
// //                     }
// //                     return `<div class="question"><div class="question-header">Questão ${index + 1} (${q.points.toFixed(2)} pts)</div><div class="question-content">${questionContent}</div>${optionsHTML}</div>`;
// //                 }).join('')}
// //             </div>

// //             ${generateStudentAnswerKey()}

// //             <div class="page-footer"><span>${exam.title} - V${version}</span><span>Página 1 de 1</span></div>
// //         </div>
// //     </body>
// //     </html>`;
// // }


// // // supabase/functions/generate-pdf/layout.ts

// // Interfaces para os dados
// interface Question {
//   id: string;
//   title: string;
//   content: any;
//   type: 'multiple_choice' | 'true_false' | 'essay';
//   points: number;
//   options?: any[];
//   correct_answer?: any;
//   text_lines?: number; // Número de linhas para questões dissertativas
// }

// interface ExamData {
//   id: string;
//   title: string;
//   subject: string;
//   institution?: string;
//   total_points: number;
//   exam_date: string | null;
//   instructions?: string;
//   layout?: string;
//   exam_headers?: any; // Cabeçalho associado
//   header?: any; // Alternativa para cabeçalho
//   professor_name?: string;
// }

// interface StudentInfo {
//   name?: string;
//   id?: string;
//   course?: string;
//   class?: string;
//   qrId?: string;
// }

// /**
//  * Gera o HTML final da prova com base nos dados fornecidos.
//  */
// export function generateExamHTML(exam: ExamData, questions: Question[], version: number, includeAnswers: boolean, studentInfo?: StudentInfo): string {
//     const header = exam.exam_headers || exam.header;
//     const isDoubleColumn = exam.layout === 'double_column';
//     const totalQuestions = questions.length;

//     // Estilos CSS com o layout de retângulos ajustado
//     const styles = `
//         @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
//         body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; margin: 0; padding: 1.5cm; color: #000; background-color: #fff; }
//         .page-container { width: 100%; max-width: 18cm; margin: auto; }
        
//         /* --- CSS do Cabeçalho Personalizado --- */
//         .custom-header { display: flex; flex-direction: row; justify-content: space-between; align-items: stretch; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 25px; font-size: 11pt; line-height: 1.5; }
//         .logo-container { flex: 0 0 80px; width: 80px; height: 80px; padding: 5px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; margin-right: 15px; }
//         .logo-container img { max-width: 100%; max-height: 100%; object-fit: contain; }
//         .info-container { flex-grow: 1; }
//         .info-container p { margin: 0 0 2px 0; }
//         .info-container .institution-name { font-weight: bold; }
//         .info-container .student-details { display: flex; justify-content: space-between; width: 80%; }
//         .grade-container { flex: 0 0 100px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; margin-left: 15px; }
//         .grade-box { border: 1px solid #000; padding: 20px 5px; text-align: center; font-weight: bold; flex-grow: 1; margin-bottom: 5px; }
//         .date { font-size: 10pt; text-align: right; }
//         .main-header, .info-grid, .student-info { display: none !important; }

//         /* --- CSS do Gabarito (AJUSTADO) --- */
//         .answer-sheet-container {
//             // border: 1px solid #000;
//             margin-bottom: 25px;
//             display: flex;
//             gap: 0.3cm; /* ADICIONADO: Cria um espaço entre as duas caixas. */
//             /* padding: 5px; */ /* REMOVIDO: O padding não é mais necessário aqui. */
//             min-height: 200px;
//         }
//         .qr-code-section {
//             flex: 0 0 140px;
//             padding: 5px;
//             display: flex;
//             flex-direction: column;
//             align-items: center;
//             justify-content: center;
//             border: 1px solid #000; /* ADICIONADO: Borda completa para a seção do QR Code. */
//             position: relative;
//             z-index: 5;
//         }
//         .qr-code-section img { width: 120px; height: 120px; }
//         .qr-code-section p { font-size: 9pt; text-align: center; margin-top: 5px; }
//         .answer-grid-section {
//             flex: 1;
//             /* border-left: 1.5px solid #000; */ /* REMOVIDO: A linha divisória foi trocada por uma borda completa. */
//             border: 1px solid #000; /* ADICIONADO: Borda completa para a grelha de respostas. */
//             padding: 0 20px;
//             display: flex;
//             flex-direction: column;
//             min-height: 180px;
//             position: relative;
//         }
//         .answer-grid-header { text-align: center; margin-bottom: 8px; font-size: 9pt; font-weight: bold; padding-top: 15px; }
//         .answer-grid-columns-container { display: flex; flex-direction: row; justify-content: space-around; flex: 1; padding: 15px 25px; }
//         .answer-grid-column { display: flex; flex-direction: column; }
//         .column-divider { width: 1.5px; background-color: #000; margin: 0 10px; }
//         .answer-options-header { display: flex; margin-bottom: 4px; padding-left: 28px; }
//         .answer-options-header span { width: 16px; text-align: center; font-size: 9pt; font-weight: bold; margin: 0 2px; }
//         .answer-row { display: flex; align-items: center; margin-bottom: 3px; }
//         .answer-row .q-number { font-weight: bold; margin-right: 6px; font-size: 10pt; width: 26px; text-align: left; }
//         .answer-row .options-bubbles { display: flex; align-items: center; }
//         .answer-row .bubble { width: 11px; height: 11px; border: 1px solid #999; /*border-radius: 50%*/; margin: 0 2.5px; }
//         .answer-row .essay-indicator { font-size: 9pt; color: #555; font-style: italic; }
        
//         /* --- CSS das Questões --- */
//         .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
//         .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
//         .question { padding-top: 15px; margin-top: 15px; border-top: 1px solid #999; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
//         .questions-container > .question:first-child { padding-top: 0; margin-top: 0; border-top: none; }
//         .question-header { font-weight: bold; margin-bottom: 8px; font-size: 11pt; }
//         .question-content { text-align: justify; margin-bottom: 10px; widows: 3; orphans: 3; }
//         .question-content img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
//         .options-list { list-style-type: none; padding-left: 0; margin-top: 5px; }
//         .option { margin-bottom: 8px; display: flex; align-items: flex-start; }
//         .option-letter { font-weight: bold; margin-right: 8px; min-width: 20px; display: inline-block; }
//         .option-text { flex: 1; line-height: 1.4; }
//         .correct-answer-highlight { background-color: #cccccc; border-radius: 3px; padding: 1px 4px; }
        
//         /* CSS para questões dissertativas */
//         .essay-lines { margin-top: 10px; width: 100%; }
//         .essay-line { border-bottom: 1px solid #999; margin-bottom: 2mm; height: 7mm; width: 100%; }
        
//         /* CSS para o gabarito destacável do aluno */
//         .student-answer-key { border-top: 2px dashed #999; padding-top: 15px; margin-top: 30px; text-align: center; }
//         .student-answer-key .cut-line { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 10pt; color: #555; margin-bottom: 10px; }
//         .student-answer-key .key-grid { display: inline-flex; flex-wrap: wrap; gap: 5px 15px; max-width: 100%; }
//         .student-answer-key .key-item { font-size: 10pt; }
//         .student-answer-key .essay-key-item { font-size: 9pt; color: #555; font-style: italic; }
        
//         .page-footer { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 5px; }
        
//         @media print { 
//             body { -webkit-print-color-adjust: exact; }
//             .anchor-marker, .answer-area-marker, .detection-reference, .correct-answer-highlight { 
//                 -webkit-print-color-adjust: exact !important; 
//                 color-adjust: exact !important; 
//             }
//         }
//     `;

//     const generateAnswerGrid = () => {
//         if (totalQuestions === 0) return '';
//         const generateGridColumn = (start: number, end: number) => {
//             let columnHTML = `<div class="answer-grid-column">`;
//             const questionsInColumn = questions.slice(start - 1, end);
//             const hasMultipleChoice = questionsInColumn.some(q => q.type === 'multiple_choice');
//             const options = hasMultipleChoice ? ['A', 'B', 'C', 'D', 'E'] : ['V', 'F'];
//             columnHTML += `<div class="answer-options-header">${options.map(l => `<span>${l}</span>`).join('')}</div>`;
//             for (let i = start; i <= end; i++) {
//                 const q = questions[i - 1];
//                 if (q.type === 'essay') {
//                     columnHTML += `<div class="answer-row"><span class="q-number">Q.${i}:</span><span class="essay-indicator">Dissertativa</span></div>`;
//                 } else {
//                     const numOptions = q.type === 'true_false' ? 2 : 5;
//                     columnHTML += `<div class="answer-row"><span class="q-number">Q.${i}:</span><div class="options-bubbles">${Array(numOptions).fill('<div class="bubble"></div>').join('')}</div></div>`;
//                 }
//             }
//             columnHTML += `</div>`;
//             return columnHTML;
//         };
//         const numCols = totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3;
//         const questionsPerColumn = Math.ceil(totalQuestions / numCols);
//         let allColumnsHTML = `<div class="answer-grid-header">Marque o gabarito preenchendo completamente a região de cada alternativa. Questões dissertativas devem ser respondidas no espaço fornecido.</div>`;
//         allColumnsHTML += `<div class="answer-grid-columns-container">`;
//         for (let i = 0; i < numCols; i++) {
//             const start = (i * questionsPerColumn) + 1;
//             const end = Math.min((i + 1) * questionsPerColumn, totalQuestions);
//             if (start > end) continue;
//             if (i > 0) {
//                 allColumnsHTML += `<div class="column-divider"></div>`;
//             }
//             allColumnsHTML += generateGridColumn(start, end);
//         }
//         allColumnsHTML += `</div>`;
//         return allColumnsHTML;
//     };

//     const generateStudentAnswerKey = () => {
//         let keyHTML = `<div class="student-answer-key">`;
//         keyHTML += `<div class="cut-line">&#9986; ----- Recorte e leve com você ----- &#9986;</div>`;
//         keyHTML += `<div class="key-grid">`;
//         for (let i = 1; i <= totalQuestions; i++) {
//             const q = questions[i - 1];
//             if (q.type === 'essay') {
//                 keyHTML += `<div class="key-item essay-key-item"><strong>${i}.</strong> Dissertativa</div>`;
//             } else {
//                 keyHTML += `<div class="key-item"><strong>${i}.</strong> _____</div>`;
//             }
//         }
//         keyHTML += `</div></div>`;
//         return keyHTML;
//     };

//     return `
//     <!DOCTYPE html>
//     <html lang="pt-BR">
//     <head>
//         <meta charset="UTF-8">
//         <title>${exam.title} - V${version}</title>
//         <style>${styles}</style>
//     </head>
//     <body>
//         <div class="page-container">
//             <div class="answer-sheet-container">
//                 <div class="qr-code-section">
//                     <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({
//                         examId: exam.id,
//                         studentId: studentInfo?.id || 'version-' + version,
//                         version: version,
//                         studentExamId: studentInfo?.qrId || null
//                     }))}" alt="QR Code" />
//                     <p>Prova: ${exam.id.split('-')[0]}.${studentInfo?.id || version}</p>
//                 </div>
//                 <div class="answer-grid-section">
//                     <div class="anchor-marker grid-top-left-anchor"></div>
//                     <div class="anchor-marker grid-top-right-anchor"></div>
//                     <div class="anchor-marker grid-bottom-left-anchor"></div>
//                     <div class="anchor-marker grid-bottom-right-anchor"></div>
//                     <div class="answer-area-marker answer-top-marker"></div>
//                     <div class="answer-area-marker answer-bottom-marker"></div>
//                     <div class="answer-area-marker answer-left-marker"></div>
//                     <div class="answer-area-marker answer-right-marker"></div>
//                     <div class="detection-reference ref-q1"></div>
//                     <div class="detection-reference ref-q5"></div>
//                     <div class="detection-reference ref-q10"></div>
//                     ${generateAnswerGrid()}
//                 </div>
//             </div>
            
//             <div class="custom-header">
//                 <div class="logo-container">
//                     ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo Instituição">` : ''}
//                 </div>
//                 <div class="info-container">
//                     <p class="institution-name">${header?.institution || 'Instituição de Ensino'}</p>
//                     <p>Professor: ${exam.professor_name || header?.content?.professor || '_____________________'}</p>
//                     <p>Disciplina: ${exam.subject}</p>
//                     <p>Curso: ${studentInfo?.course || '___________________________________'}</p>
//                     <p>Aluno: ${studentInfo?.name || '______________________________________________________'}</p>
//                     <div class="student-details">
//                         <span>Matrícula: ${studentInfo?.id || '_________________'}</span>
//                         <span>Turma: ${studentInfo?.class || header?.content?.turma || '__'}</span>
//                     </div>
//                 </div>
//                 <div class="grade-container">
//                     <div class="grade-box">
//                         Nota
//                     </div>
//                     <p class="date">Data: ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/______'}</p>
//                 </div>
//             </div>

//             ${exam.instructions ? `<div class="instructions"><strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}</div>` : ''}
            
//             <div class="questions-container">
//                 ${questions.map((q, index) => {
//                     let questionContent = typeof q.content === 'string' ? q.content : JSON.stringify(q.content);
//                     let optionsHTML = '';
//                     if (q.type === 'multiple_choice' && Array.isArray(q.options)) {
//                         optionsHTML = `<ol class="options-list">${q.options.map((opt: any, optIndex: number) => {
//                             const isCorrect = includeAnswers && Array.isArray(q.correct_answer) && q.correct_answer.includes(opt.id);
//                             return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}">
//                                 <span class="option-letter">${String.fromCharCode(65 + optIndex)})</span>
//                                 <div class="option-text">${opt.text}</div>
//                             </li>`;
//                         }).join('')}</ol>`;
//                     } else if (q.type === 'true_false') {
//                         optionsHTML = `<ol class="options-list">${['Verdadeiro', 'Falso'].map((opt, optIndex) => {
//                             const isCorrect = includeAnswers && q.correct_answer === (optIndex === 0 ? true : false);
//                             return `<li class="option ${isCorrect ? 'correct-answer-highlight' : ''}">
//                                 <span class="option-letter">${optIndex === 0 ? 'V' : 'F'})</span>
//                                 <div class="option-text">${opt}</div>
//                             </li>`;
//                         }).join('')}</ol>`;
//                     } else if (q.type === 'essay') {
//                         const numLines = q.text_lines || 5; // Padrão de 5 linhas se não especificado
//                         const lineWidth = isDoubleColumn ? '100%' : '100%'; // Ajustar para layout
//                         optionsHTML = `<div class="essay-lines">${Array(numLines).fill().map(() => `<div class="essay-line"></div>`).join('')}</div>`;
//                     }
//                     return `<div class="question"><div class="question-header">Questão ${index + 1} (${q.points.toFixed(2)} pts)</div><div class="question-content">${questionContent}</div>${optionsHTML}</div>`;
//                 }).join('')}
//             </div>

//             ${generateStudentAnswerKey()}

//             <div class="page-footer"><span>${exam.title} - V${version}</span><span>Página 1 de 1</span></div>
//         </div>
//     </body>
//     </html>`;
// }


// // supabase/functions/generate-pdf/layout.ts

// Interfaces (mantidas como no original)
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

/**
 * Gera o HTML final da prova com base nos dados fornecidos, incluindo âncoras de deteção.
 */
export function generateExamHTML(exam: ExamData, questions: Question[], version: number, includeAnswers: boolean, studentInfo?: StudentInfo): string {
    const header = exam.exam_headers || exam.header;
    const isDoubleColumn = exam.layout === 'double_column';
    const totalQuestions = questions.length;

    // Estilos CSS com ajuste fino de box-sizing
    const styles = `
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono&family=Times+New+Roman&display=swap');
        
        /* --- AJUSTE FINO DE ALINHAMENTO --- */
        *, *::before, *::after {
            box-sizing: border-box;
        }

        :root {
            /* --- Definição das Fontes --- */
            --font-main: 'Times New Roman', Times, serif;
            --font-mono: 'Roboto Mono', monospace;

            /* --- Variáveis para o Bubble de Marcação --- */
            --bubble-size: 11px;
            --bubble-margin: 0 2.5px;
            --bubble-border: 1px solid #000;
            
            /* --- Variáveis para cálculo do gabarito --- */
            --anchor-width: var(--bubble-size);
            --anchor-margin-right: 7px;
            --q-number-width: 30px;
            --q-number-margin-right: 6px;

            /* --- Cálculo automático do espaçamento total --- */
            --total-left-spacing: calc(var(--anchor-width) + var(--anchor-margin-right) + var(--q-number-width) + var(--q-number-margin-right));
        }

        body { font-family: var(--font-main); font-size: 11pt; line-height: 1.4; margin: 0; padding: 1.5cm; color: #000; background-color: #fff; }
        .page-container { width: 100%; max-width: 18cm; margin: auto; }
        
        /* --- CSS do Cabeçalho Personalizado (sem alterações) --- */
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

        /* --- CSS do Gabarito (COM FONTE MONOESPAÇADA) --- */
        .answer-sheet-container { 
            font-family: var(--font-mono);
            margin-bottom: 25px; 
            display: flex; 
            gap: 0.3cm; 
            min-height: 200px; 
        }
        .qr-code-section { flex: 0 0 140px; padding: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #000; }
        .qr-code-section img { width: 120px; height: 120px; }
        .qr-code-section p { font-size: 9pt; text-align: center; margin-top: 5px; }
        .answer-grid-section { flex: 1; border: 1px solid #000; padding: 10px 5px; }
        .answer-grid-header { text-align: center; margin-bottom: 8px; font-size: 9pt; font-weight: bold; }
        .answer-grid-columns-container { display: flex; flex-direction: row; justify-content: space-around; padding: 5px 0; }
        .answer-grid-column { display: flex; flex-direction: column; align-items: flex-start; }
        .column-divider { width: 1.5px; background-color: #000; margin: 0 10px; }
        
        .answer-options-header { display: flex; align-items: center; margin-bottom: 4px; height: 15px; padding-left: var(--total-left-spacing); }
        .answer-options-header .options-bubbles, .answer-row-horizontal-anchors .options-bubbles { display: flex; align-items: center; }
        .answer-options-header span { width: var(--bubble-size); text-align: center; font-size: 9pt; font-weight: bold; margin: var(--bubble-margin); }

        .answer-row { display: flex; align-items: center; margin-bottom: 4px; height: 15px; }
        .answer-row .anchor-marker-vertical { width: var(--anchor-width); height: var(--bubble-size); margin-right: var(--anchor-margin-right); }
        .answer-row .q-number { font-weight: bold; font-size: 10pt; text-align: left; width: var(--q-number-width); margin-right: var(--q-number-margin-right); }
        .answer-row .options-bubbles { display: flex; align-items: center; }
        .answer-row .bubble { width: var(--bubble-size); height: var(--bubble-size); border: var(--bubble-border); margin: var(--bubble-margin); }
        .answer-row .essay-indicator { font-family: var(--font-main); font-size: 9pt; color: #555; font-style: italic; margin-left: 5px; }

        .answer-row-horizontal-anchors { display: flex; align-items: center; margin-top: 8px; height: 10px; padding-left: var(--total-left-spacing); }
        .answer-row-horizontal-anchors .anchor-marker-horizontal { width: var(--bubble-size); height: var(--bubble-size); margin: var(--bubble-margin); }

        .anchor-marker-vertical, .anchor-marker-horizontal { background-color: #000 !important; -webkit-print-color-adjust: exact !important; }

        /* --- CSS das Questões (sem alterações) --- */
        .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
        .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
        .question { padding-top: 15px; margin-top: 15px; border-top: 1px solid #999; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
        .questions-container > .question:first-child { padding-top: 0; margin-top: 0; border-top: none; }
        .question-header { font-weight: bold; margin-bottom: 8px; font-size: 11pt; }
        .question-content { text-align: justify; margin-bottom: 10px; widows: 3; orphans: 3; }
        .question-content img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
        .options-list { list-style-type: none; padding-left: 0; margin-top: 5px; }
        .option { margin-bottom: 8px; display: flex; align-items: flex-start; }
        .option-letter { font-weight: bold; margin-right: 8px; min-width: 20px; display: inline-block; }
        .option-text { flex: 1; line-height: 1.4; }
        .correct-answer-highlight { background-color: #cccccc; border-radius: 3px; padding: 1px 4px; }
        .essay-lines { margin-top: 10px; width: 100%; }
        .essay-line { border-bottom: 1px solid #999; margin-bottom: 2mm; height: 7mm; width: 100%; }
        .student-answer-key { border-top: 2px dashed #999; padding-top: 15px; margin-top: 30px; text-align: center; }
        .student-answer-key .cut-line { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 10pt; color: #555; margin-bottom: 10px; }
        .student-answer-key .key-grid { display: inline-flex; flex-wrap: wrap; gap: 5px 15px; max-width: 100%; }
        .student-answer-key .key-item { font-size: 10pt; }
        .student-answer-key .essay-key-item { font-size: 9pt; color: #555; font-style: italic; }
        .page-footer { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 5px; }
        
        @media print { 
            body { -webkit-print-color-adjust: exact; }
            .anchor-marker-vertical, .anchor-marker-horizontal, .correct-answer-highlight { 
                -webkit-print-color-adjust: exact !important; 
                color-adjust: exact !important; 
            }
        }
    `;

    // O restante da função (generateAnswerGrid, generateStudentAnswerKey, e o return)
    // permanece exatamente o mesmo da versão anterior, pois a lógica de geração do HTML não muda.

    const generateAnswerGrid = () => {
        if (totalQuestions === 0) return '';

        const generateGridColumn = (start: number, end: number) => {
            let columnHTML = `<div class="answer-grid-column">`;
            const questionsInColumn = questions.slice(start - 1, end);

            const maxOptions = Math.max(...questionsInColumn.map(q => {
                if (q.type === 'essay') return 0;
                if (q.type === 'true_false') return 2;
                if (Array.isArray(q.options)) return q.options.length;
                return 5;
            }));

            const options = Array.from({ length: maxOptions }, (_, i) => String.fromCharCode(65 + i));

            // Cabeçalho de letras
            columnHTML += `<div class="answer-options-header">`;
            columnHTML += `<div class="options-bubbles">`;
            options.forEach(letter => {
                columnHTML += `<span>${letter}</span>`;
            });
            columnHTML += `</div></div>`;

            // Questões
            for (let i = start; i <= end; i++) {
                const q = questions[i - 1];
                if (!q) continue;
                const questionNumber = String(i).padStart(2, '0');
                const isEssay = q.type === 'essay';

                columnHTML += `<div class="answer-row">`;
                columnHTML += `<div class="anchor-marker-vertical" ${isEssay ? 'style="visibility: hidden;"' : ''}></div>`;
                columnHTML += `<span class="q-number">${questionNumber}.</span>`;

                if (isEssay) {
                    columnHTML += `<span class="essay-indicator">Dissertativa</span>`;
                } else {
                    const actualOptions = q.type === 'true_false' ? 2 : (Array.isArray(q.options) ? q.options.length : 5);
                    columnHTML += `<div class="options-bubbles">`;
                    for (let j = 0; j < maxOptions; j++) {
                        columnHTML += j < actualOptions
                            ? `<div class="bubble"></div>`
                            : `<div class="bubble" style="visibility: hidden;"></div>`;
                    }
                    columnHTML += `</div>`;
                }
                columnHTML += `</div>`;
            }

            // Linha inferior de âncoras horizontais
            columnHTML += `<div class="answer-row-horizontal-anchors">`;
            columnHTML += `<div class="options-bubbles">`;
            for (let i = 0; i < maxOptions; i++) {
                columnHTML += `<div class="anchor-marker-horizontal"></div>`;
            }
            columnHTML += `</div></div>`;

            columnHTML += `</div>`;
            return columnHTML;
        };

        const numCols = totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3;
        const questionsPerColumn = Math.ceil(totalQuestions / numCols);

        let allColumnsHTML = `<div class="answer-grid-header">Marque o gabarito preenchendo completamente a região de cada alternativa. Questões dissertativas devem ser respondidas no espaço fornecido.</div>`;
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
            <div class="answer-sheet-container">
                <div class="qr-code-section">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({
                        examId: exam.id,
                        studentId: studentInfo?.id || 'version-' + version,
                        version: version,
                        studentExamId: studentInfo?.qrId || null
                    }))}" alt="QR Code" />
                    <p>Prova: ${exam.id.split('-')[0]}.${studentInfo?.id || version}</p>
                </div>
                <div class="answer-grid-section">
                    ${generateAnswerGrid()}
                </div>
            </div>
            
            <div class="custom-header">
                <div class="logo-container">
                    ${header?.logo_url ? `<img src="${header.logo_url}" alt="Logo Instituição">` : ''}
                </div>
                <div class="info-container">
                    <p class="institution-name">${header?.institution || 'Instituição de Ensino'}</p>
                    <p>Professor: ${exam.professor_name || header?.content?.professor || '_____________________'}</p>
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
                        optionsHTML = `<div class="essay-lines">${Array(numLines).fill().map(() => `<div class="essay-line"></div>`).join('')}</div>`;
                    }
                    return `<div class="question"><div class="question-header">Questão ${questionNumber} (${q.points.toFixed(2)} pts)</div><div class="question-content">${questionContent}</div>${optionsHTML}</div>`;
                }).join('')}
            </div>

            ${generateStudentAnswerKey()}

            <div class="page-footer"><span>${exam.title} - V${version}</span><span>Página 1 de 1</span></div>
        </div>
    </body>
    </html>`;
}