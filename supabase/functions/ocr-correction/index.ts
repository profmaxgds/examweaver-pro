import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
// @deno-types="https://deno.land/x/canvas@v1.4.1/mod.ts"
import { createCanvas, loadImage } from "https://deno.land/x/canvas@v1.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    
    // Verificar se é o novo formato (fileName + examInfo) ou formato antigo (imageData + examId)
    const isNewFormat = requestData.fileName && requestData.examInfo;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (isNewFormat) {
      return await processNewFormat(supabase, requestData);
    } else {
      return await processLegacyFormat(supabase, requestData);
    }

  } catch (error) {
    console.error('Error processing OCR correction:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Novo formato: processar arquivo do storage com examInfo
async function processNewFormat(supabase: any, { fileName, mode, examInfo }: any) {
  console.log('Processando novo formato:', { fileName, mode, examInfo });

  if (!fileName || !examInfo) {
    throw new Error('Parâmetros obrigatórios: fileName, examInfo');
  }

  // Baixar a imagem do storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('correction-scans')
    .download(fileName);

  if (downloadError) {
    console.error('Erro ao baixar arquivo:', downloadError);
    throw new Error(`Erro ao baixar arquivo: ${downloadError.message}`);
  }

  // Converter para base64 para processamento
  const arrayBuffer = await fileData.arrayBuffer();
  const base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const dataUrl = `data:image/jpeg;base64,${base64Image}`;

  console.log('Arquivo carregado, processando marcações...');

  // Processar OCR para extrair respostas
  const ocrResults = await processOCR(dataUrl);
  
  // Extrair respostas marcadas
  const questionCount = Object.keys(examInfo.answerKey).length;
  const detectedAnswers = extractAnswers(ocrResults, questionCount);

  console.log('Marcações detectadas:', detectedAnswers);

  const response = {
    success: true,
    detectedAnswers,
    fileName,
    examInfo,
    processedAt: new Date().toISOString(),
    ocrResults: ocrResults
  };

  return new Response(
    JSON.stringify(response),
    { 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      } 
    }
  );
}

// Formato antigo: manter compatibilidade
async function processLegacyFormat(supabase: any, { imageData, examId }: any) {
  if (!imageData || !examId) {
    throw new Error('Missing required parameters');
  }

  // Buscar dados da prova
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select('*')
    .eq('id', examId)
    .single();

  if (examError || !exam) {
    throw new Error('Exam not found');
  }

  // Processar QR Code para detectar versão da prova
  const qrData = await extractQRCode(imageData);
  let version = 1;
  if (qrData) {
    const versionMatch = qrData.match(/v(\d+)/);
    if (versionMatch) {
      version = parseInt(versionMatch[1]);
    }
  }

  // Processar OCR para extrair respostas
  const ocrResults = await processOCR(imageData);
  
  // Extrair dados do estudante
  const studentInfo = extractStudentInfo(ocrResults);
  
  // Extrair respostas marcadas
  const answers = extractAnswers(ocrResults, exam.question_ids.length);
  
  // Calcular pontuação
  const { score, detailedResults } = await calculateScore(
    supabase, 
    exam, 
    answers, 
    version
  );

  // Determinar confiança do OCR
  const confidenceScore = calculateConfidence(ocrResults, answers);

  // Salvar correção
  const { data: correction, error: correctionError } = await supabase
    .from('corrections')
    .insert({
      exam_id: examId,
      version,
      student_name: studentInfo.name || 'Nome não identificado',
      student_id: studentInfo.id || null,
      answers: answers,
      score,
      ocr_data: ocrResults,
      auto_corrected: true,
      manual_review: confidenceScore < 0.8,
      confidence_score: confidenceScore,
      status: confidenceScore >= 0.8 ? 'completed' : 'pending'
    })
    .select()
    .single();

  if (correctionError) {
    throw new Error('Failed to save correction');
  }

  return new Response(
    JSON.stringify({
      correction,
      detailedResults,
      needsReview: confidenceScore < 0.8,
      confidence: confidenceScore
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function extractQRCode(imageData: string): Promise<string | null> {
  try {
    // Simulated QR code extraction
    // In a real implementation, you would use a QR code library
    return null;
  } catch (error) {
    console.error('QR Code extraction failed:', error);
    return null;
  }
}

async function processOCR(imageData: string): Promise<any> {
  try {
    console.log('Iniciando detecção simples de marcações...');
    
    // Carregar a imagem usando canvas
    const image = await loadImage(imageData);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(image, 0, 0);
    const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Detectar marcadores âncora e região das questões
    const anchorMarkers = detectAnchorMarkers(imageDataObj);
    console.log('Marcadores âncora detectados:', anchorMarkers.length);
    
    // Detectar marcações das alternativas
    const detectedMarks = detectAnswerMarks(imageDataObj, anchorMarkers);
    console.log('Marcações detectadas:', detectedMarks);
    
    return {
      detectedMarks,
      anchorMarkers,
      confidence: 0.85,
      imageSize: { width: image.width, height: image.height }
    };

  } catch (error) {
    console.error('Detecção de marcações falhou:', error);
    throw error;
  }
}

// Detectar marcadores âncora (pequenos quadrados pretos nos cantos)
function detectAnchorMarkers(imageData: ImageData): Array<{x: number, y: number, size: number}> {
  const { data, width, height } = imageData;
  const markers: Array<{x: number, y: number, size: number}> = [];
  
  // Procurar nas regiões dos cantos (primeiros 20% da imagem)
  const searchRegions = [
    { startX: 0, endX: Math.floor(width * 0.2), startY: 0, endY: Math.floor(height * 0.2) }, // Canto superior esquerdo
    { startX: Math.floor(width * 0.8), endX: width, startY: 0, endY: Math.floor(height * 0.2) }, // Canto superior direito
    { startX: 0, endX: Math.floor(width * 0.2), startY: Math.floor(height * 0.8), endY: height }, // Canto inferior esquerdo
    { startX: Math.floor(width * 0.8), endX: width, startY: Math.floor(height * 0.8), endY: height } // Canto inferior direito
  ];
  
  for (const region of searchRegions) {
    const marker = findSquareMarker(data, width, height, region);
    if (marker) {
      markers.push(marker);
    }
  }
  
  return markers;
}

// Encontrar marcador quadrado em uma região específica
function findSquareMarker(
  data: Uint8ClampedArray, 
  width: number, 
  height: number, 
  region: {startX: number, endX: number, startY: number, endY: number}
): {x: number, y: number, size: number} | null {
  
  for (let y = region.startY; y < region.endY - 10; y += 2) {
    for (let x = region.startX; x < region.endX - 10; x += 2) {
      
      // Testar diferentes tamanhos de marcadores (5x5 até 20x20)
      for (let size = 5; size <= 20; size += 2) {
        if (x + size >= region.endX || y + size >= region.endY) continue;
        
        let blackPixels = 0;
        let totalPixels = 0;
        
        // Verificar se é um quadrado predominantemente preto
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const pixelIndex = ((y + dy) * width + (x + dx)) * 4;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            
            // Pixel escuro se a média RGB for baixa
            const brightness = (r + g + b) / 3;
            if (brightness < 80) {
              blackPixels++;
            }
            totalPixels++;
          }
        }
        
        // Se mais de 70% dos pixels são escuros, é provavelmente um marcador
        if (blackPixels / totalPixels > 0.7) {
          return { x: x + size/2, y: y + size/2, size };
        }
      }
    }
  }
  
  return null;
}

// Detectar marcações das alternativas baseado na posição dos marcadores
function detectAnswerMarks(
  imageData: ImageData, 
  anchorMarkers: Array<{x: number, y: number, size: number}>
): Record<string, string> {
  
  if (anchorMarkers.length < 2) {
    console.log('Marcadores âncora insuficientes para detecção precisa');
    return {};
  }
  
  const { data, width, height } = imageData;
  const answers: Record<string, string> = {};
  
  // Estimar região das questões baseado nos marcadores
  const minX = Math.min(...anchorMarkers.map(m => m.x));
  const maxX = Math.max(...anchorMarkers.map(m => m.x));
  const minY = Math.min(...anchorMarkers.map(m => m.y));
  const maxY = Math.max(...anchorMarkers.map(m => m.y));
  
  // Assumir que as questões estão em uma grade regular
  const questionsPerRow = 1; // Assumindo uma questão por linha
  const optionsPerQuestion = 5; // A, B, C, D, E
  
  // Estimar espaçamento entre questões e opções
  const questionHeight = (maxY - minY) / 20; // Assumindo até 20 questões
  const optionWidth = (maxX - minX) / (optionsPerQuestion + 1);
  
  // Procurar por marcações em cada posição esperada
  for (let questionNum = 1; questionNum <= 20; questionNum++) {
    const questionY = minY + (questionNum - 1) * questionHeight;
    
    if (questionY > maxY) break;
    
    let bestOption = '';
    let maxDarkness = 0;
    
    // Verificar cada opção (A, B, C, D, E)
    for (let optionIndex = 0; optionIndex < optionsPerQuestion; optionIndex++) {
      const optionX = minX + (optionIndex + 1) * optionWidth;
      
      // Verificar escuridão em uma área pequena ao redor da posição esperada
      const darkness = checkMarkDarkness(data, width, height, optionX, questionY, 15);
      
      if (darkness > maxDarkness && darkness > 0.4) { // Threshold para considerar marcado
        maxDarkness = darkness;
        bestOption = String.fromCharCode(65 + optionIndex); // A, B, C, D, E
      }
    }
    
    if (bestOption) {
      answers[questionNum.toString()] = bestOption;
    }
  }
  
  return answers;
}

// Verificar escuridão em uma área específica (indicativo de marcação)
function checkMarkDarkness(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number
): number {
  
  let darkPixels = 0;
  let totalPixels = 0;
  
  const startX = Math.max(0, centerX - radius);
  const endX = Math.min(width, centerX + radius);
  const startY = Math.max(0, centerY - radius);
  const endY = Math.min(height, centerY + radius);
  
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const pixelIndex = (y * width + x) * 4;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      
      const brightness = (r + g + b) / 3;
      if (brightness < 120) { // Pixel relativamente escuro
        darkPixels++;
      }
      totalPixels++;
    }
  }
  
  return totalPixels > 0 ? darkPixels / totalPixels : 0;
}

function extractStudentInfo(ocrResults: any): { name?: string; id?: string } {
  try {
    const text = ocrResults.text;
    
    // Try to parse JSON response from OCR
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.nome || parsed.name,
        id: parsed.matricula || parsed.id
      };
    }

    // Fallback to regex extraction
    const nameMatch = text.match(/nome[:\s]*([A-Za-z\s]+)/i);
    const idMatch = text.match(/matr[íi]cula[:\s]*([0-9A-Za-z]+)/i);

    return {
      name: nameMatch?.[1]?.trim(),
      id: idMatch?.[1]?.trim()
    };
  } catch (error) {
    console.error('Error extracting student info:', error);
    return {};
  }
}

function extractAnswers(ocrResults: any, questionCount: number): Record<string, string> {
  try {
    // Se já temos marcações detectadas diretamente, usar elas
    if (ocrResults.detectedMarks) {
      console.log('Usando marcações detectadas diretamente:', ocrResults.detectedMarks);
      return ocrResults.detectedMarks;
    }
    
    // Fallback para compatibilidade com formato antigo
    const text = ocrResults.text || '';
    const answers: Record<string, string> = {};

    // Tentar parsear resposta JSON do OCR (compatibilidade)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.respostas || parsed.answers) {
          const responseData = parsed.respostas || parsed.answers;
          
          for (let i = 1; i <= questionCount; i++) {
            const answer = responseData[i.toString()] || responseData[`questao_${i}`];
            if (answer && ['A', 'B', 'C', 'D', 'E'].includes(answer.toUpperCase())) {
              answers[i.toString()] = answer.toUpperCase();
            }
          }
        }
      } catch (e) {
        console.error('Erro ao parsear JSON:', e);
      }
    }

    return answers;
  } catch (error) {
    console.error('Error extracting answers:', error);
    return {};
  }
}

async function calculateScore(
  supabase: any, 
  exam: any, 
  studentAnswers: Record<string, string>,
  version: number
): Promise<{ score: number; detailedResults: any[] }> {
  // Buscar questões
  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', exam.question_ids);

  if (!questions) {
    throw new Error('Questions not found');
  }

  let totalScore = 0;
  const detailedResults = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const questionNumber = (i + 1).toString();
    const studentAnswer = studentAnswers[questionNumber];
    
    let isCorrect = false;
    let correctAnswer = null;

    if (question.type === 'multiple_choice' && question.options) {
      // Considerar embaralhamento de opções se necessário
      let options = question.options;
      if (exam.shuffle_options && version > 1) {
        options = shuffleArray(question.options, version * 100 + parseInt(question.id.slice(-4), 16));
      }

      correctAnswer = options.find((opt: any) => 
        question.correct_answer.includes(opt.id)
      );
      
      if (correctAnswer && studentAnswer) {
        const correctIndex = options.findIndex((opt: any) => opt.id === correctAnswer.id);
        const correctLetter = String.fromCharCode(65 + correctIndex);
        isCorrect = studentAnswer === correctLetter;
      }
    }

    if (isCorrect) {
      totalScore += question.points;
    }

    detailedResults.push({
      questionNumber: i + 1,
      studentAnswer,
      correctAnswer: correctAnswer?.text || question.correct_answer,
      isCorrect,
      points: isCorrect ? question.points : 0,
      maxPoints: question.points
    });
  }

  return { score: totalScore, detailedResults };
}

function calculateConfidence(ocrResults: any, answers: Record<string, string>): number {
  // Base confidence from OCR
  let confidence = ocrResults.confidence || 0.7;
  
  // Reduce confidence if many answers are missing
  const totalQuestions = Object.keys(answers).length;
  const answeredQuestions = Object.values(answers).filter(a => a).length;
  
  if (totalQuestions > 0) {
    const answerRate = answeredQuestions / totalQuestions;
    confidence *= (0.5 + 0.5 * answerRate);
  }

  return Math.max(0, Math.min(1, confidence));
}

function shuffleArray<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let m = arr.length;
  
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