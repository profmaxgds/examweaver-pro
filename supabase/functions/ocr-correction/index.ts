import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, examId } = await req.json();

    if (!imageData || !examId) {
      throw new Error('Missing required parameters');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

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
    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Convert base64 to binary
    const binaryData = atob(base64Data);
    const uint8Array = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      uint8Array[i] = binaryData.charCodeAt(i);
    }

    // Create form data for OpenAI Vision API
    const formData = new FormData();
    const blob = new Blob([uint8Array], { type: 'image/jpeg' });
    formData.append('file', blob, 'scan.jpg');

    // Use OpenAI Vision API for OCR
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analise esta folha de respostas e extraia: 1) Nome do aluno, 2) Matrícula (se houver), 3) Respostas marcadas para cada questão (A, B, C, D, E ou em branco). Retorne em formato JSON."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const result = await response.json();
    return {
      text: result.choices[0].message.content,
      confidence: 0.9 // Simulated confidence
    };

  } catch (error) {
    console.error('OCR processing failed:', error);
    throw error;
  }
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
    const text = ocrResults.text;
    const answers: Record<string, string> = {};

    // Try to parse JSON response from OCR
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
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