import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

// Interfaces para os dados da prova
interface Question {
  id: string;
  title: string;
  content: any;
  type: string;
  points: number;
  options?: any[];
  correct_answer?: any;
  essayLines?: number;
  essay_lines?: number;
}

interface ExamHeader {
  institution?: string;
  logo_url?: string;
  content?: any;
}

interface ExamData {
  id: string;
  title: string;
  subject: string;
  total_points: number;
  exam_date: string | null;
  instructions?: string;
  layout?: string;
  institution?: string;
  exam_headers?: ExamHeader | null;
}

interface ExamPrintTemplateProps {
  exam: ExamData;
  questions: Question[];
  version: number;
  includeAnswers?: boolean;
}

// Componente React que renderiza o HTML da Prova
export function ExamPrintTemplate({ exam, questions, version, includeAnswers }: ExamPrintTemplateProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  // Gera o QR Code dinamicamente no cliente
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        // Gerar QR code com formato JSON padronizado
        const qrData = {
          examId: exam.id,
          studentId: `version-${version}`, // Para versões gerais
          version: version
        };
        
        const url = await QRCode.toDataURL(JSON.stringify(qrData), {
          width: 120,
          margin: 1,
        });
        setQrCodeUrl(url);
      } catch (err) {
        console.error('Falha ao gerar QR code:', err);
      }
    };
    generateQRCode();
  }, [exam.id, version]);

  const header = exam.exam_headers;
  const isDoubleColumn = exam.layout === 'double_column';

  // Função para gerar o gabarito de bolhas com âncoras
  const generateAnswerGrid = () => {
    const multipleChoiceQuestions = questions.filter(q => q.type === 'multiple_choice');
    if (multipleChoiceQuestions.length === 0) return '';
    
    let grid = `<div class="answer-grid-container">`;
    grid += `<div class="answer-grid-header">Marque o gabarito preenchendo completamente a região de cada alternativa.</div>`;
    grid += `<div class="answer-options-header">${['a', 'b', 'c', 'd', 'e'].map(l => `<span>${l}</span>`).join('')}</div>`;
    grid += `<div class="bubbles-area">`;
    grid += `<div class="anchor-corner anchor-top-left"></div>`;
    grid += `<div class="anchor-corner anchor-top-right"></div>`;
    
    multipleChoiceQuestions.forEach((_, index) => {
        const questionNumber = index + 1;
        grid += `
        <div class="answer-row">
            <span class="q-number">Q.${questionNumber}:</span>
            <div class="options-bubbles">
                ${Array(5).fill(0).map(() => `<div class="bubble-outer"><div class="bubble-inner"></div></div>`).join('')}
            </div>
        </div>`;
    });
    
    grid += `<div class="anchor-corner anchor-bottom-left"></div>`;
    grid += `<div class="anchor-corner anchor-bottom-right"></div>`;
    grid += `</div>`;
    grid += `</div>`;
    return grid;
  };

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="UTF-8" />
        <title>{`${exam.title} - V${version}`}</title>
        <style>{`
          /* Estilos otimizados para impressão, replicando o PDF */
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
          .answer-grid-section { flex: 1; border-left: 1.5px solid #000; padding: 10px; display: flex; flex-direction: column; position: relative; }
          .answer-grid-container { position: relative; padding: 20px; border: 2px solid #000; margin: 5px; }
          .bubbles-area { position: relative; padding: 10px; }
          .anchor-corner { position: absolute; width: 20px; height: 20px; background-color: #000; border: 2px solid #000; }
          .anchor-top-left { top: -2px; left: -2px; }
          .anchor-top-right { top: -2px; right: -2px; }
          .anchor-bottom-left { bottom: -2px; left: -2px; }
          .anchor-bottom-right { bottom: -2px; right: -2px; }
          .answer-grid-header { text-align: center; margin: 10px 0; font-size: 9pt; font-weight: bold; }
          .answer-options-header { display: flex; margin-left: 40px; margin-bottom: 8px; gap: 6px; }
          .answer-options-header span { width: 14px; text-align: center; font-size: 9pt; font-weight: bold; }
          .answer-row { display: flex; align-items: center; margin-bottom: 5px; }
          .answer-row .q-number { font-weight: bold; margin-right: 10px; font-size: 10pt; width: 30px; }
          .answer-row .options-bubbles { display: flex; gap: 6px; }
          .bubble-outer { width: 14px; height: 14px; border: 2px solid #000; border-radius: 50%; display: flex; justify-content: center; align-items: center; background-color: white; }
          .bubble-inner { width: 6px; height: 6px; border: 1px solid #000; border-radius: 50%; background-color: white; }
          .essay-lines { margin-top: 10px; width: 100%; }
          .essay-line { border-bottom: 1px solid #333; height: 18px; margin-bottom: 4px; width: 100%; }
          .instructions { margin-bottom: 25px; text-align: justify; font-size: 10pt; color: #444; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
          .questions-container { column-count: ${isDoubleColumn ? 2 : 1}; column-gap: 1.5cm; }
          .question { margin-bottom: 18px; page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
          .question-header { font-weight: bold; margin-bottom: 8px; font-size: 11pt; }
          .question-content { text-align: justify; margin-bottom: 10px; }
          .options-list { list-style-type: none; padding-left: 0; margin-top: 5px; }
          .option { margin-bottom: 6px; display: flex; align-items: flex-start; }
          .option-letter { font-weight: bold; margin-right: 8px; }
          .correct-answer-highlight { background-color: #cccccc !important; border-radius: 3px; padding: 1px 4px; }
          .page-footer { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 5px; }
          @media print { body { -webkit-print-color-adjust: exact; } }
        `}</style>
      </head>
      <body>
        <div className="page-container">
            <div className="answer-sheet-container">
                <div className="qr-code-section">
                    {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" />}
                    <p>Prova: {exam.id.split('-')[0]}.${version}</p>
                </div>
                <div className="answer-grid-section" dangerouslySetInnerHTML={{ __html: generateAnswerGrid() }} />
            </div>
            <div className="main-header">
                {header?.logo_url && <img src={header.logo_url} alt="Logo" />}
                <div className="institution">{header?.institution || exam.institution || 'Instituição de Ensino'}</div>
                {header?.content?.subtitle && <div className="subtitle">{header.content.subtitle}</div>}
                <div className="title">{exam.title}</div>
            </div>
            <div className="info-grid">
                <div><strong>Disciplina:</strong> {exam.subject}</div>
                <div><strong>Professor(a):</strong> {header?.content?.professor || '__________________'}</div>
                <div><strong>Data:</strong> {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '___/___/______'}</div>
                <div><strong>Valor:</strong> {exam.total_points.toFixed(2)} pontos</div>
            </div>
            <div className="student-info"><div className="student-field"><strong>Aluno(a):</strong> __________________________________________________________________</div></div>
            {exam.instructions && <div className="instructions" dangerouslySetInnerHTML={{ __html: `<strong>Instruções:</strong><br>${exam.instructions.replace(/\n/g, '<br>')}` }} />}
            <div className="questions-container">
                {questions.map((q, index) => (
                    <div className="question" key={q.id}>
                        <div className="question-header">Questão {index + 1} ({q.points.toFixed(2)} pts)</div>
                        <div className="question-content" dangerouslySetInnerHTML={{ __html: typeof q.content === 'string' ? q.content : JSON.stringify(q.content) }} />
                        {q.type === 'multiple_choice' && Array.isArray(q.options) && (
                            <ol className="options-list">
                                {q.options.map((opt: any, optIndex: number) => {
                                    const isCorrect = includeAnswers && Array.isArray(q.correct_answer) && q.correct_answer.includes(opt.id);
                                    return (
                                        <li key={opt.id} className={`option ${isCorrect ? 'correct-answer-highlight' : ''}`}>
                                            <span className="option-letter">{String.fromCharCode(97 + optIndex)})</span>
                                            <div dangerouslySetInnerHTML={{ __html: opt.text }} />
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        {q.type === 'essay' && (
                            <div className="essay-lines">
                                {Array.from({ length: q.essayLines || q.essay_lines || 5 }, (_, i) => (
                                    <div key={i} className="essay-line"></div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="page-footer">
                <span>{`${exam.title} - V${version}`}</span>
                <span>Página 1 de 1</span>
            </div>
        </div>
      </body>
    </html>
  );
}