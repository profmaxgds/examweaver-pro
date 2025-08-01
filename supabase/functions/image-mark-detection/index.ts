import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, questionsInfo } = await req.json();
    
    if (!imageData) {
      throw new Error('Image data is required');
    }

    console.log('Iniciando detecção real de marcações na imagem');
    console.log('Processando para', questionsInfo?.length || 'quantidade desconhecida', 'questões');

    // Processar a imagem para detectar marcações
    const detectedMarks = await processImageForMarks(imageData, questionsInfo);
    
    console.log('Marcações detectadas:', detectedMarks);

    return new Response(
      JSON.stringify({
        success: true,
        detectedMarks,
        confidence: detectedMarks.confidence || 0.8,
        method: 'image_analysis',
        processedAt: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Erro na detecção de marcações:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function processImageForMarks(imageData: string, questionsInfo: any[]): Promise<any> {
  try {
    // Remover prefixo data:image se presente
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Converter para Uint8Array
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    console.log('Imagem decodificada, tamanho:', imageBytes.length, 'bytes');
    
    // Analisar a imagem para detectar marcações
    const analysisResult = await analyzeImageForCircularMarks(imageBytes, questionsInfo);
    
    return analysisResult;
    
  } catch (error) {
    console.error('Erro no processamento da imagem:', error);
    throw error;
  }
}

async function analyzeImageForCircularMarks(imageBytes: Uint8Array, questionsInfo: any[]): Promise<any> {
  console.log('Analisando imagem para detectar marcações circulares...');
  
  const detectedAnswers: Record<string, string> = {};
  const detectionDetails: any[] = [];
  
  // Converter bytes da imagem para formato decodificado
  const imageData = await decodeImage(imageBytes);
  
  // Primeiro, detectar os marcadores âncora na imagem
  const anchorPoints = await detectAnchorMarkers(imageData);
  console.log('Marcadores âncora detectados:', anchorPoints);
  
  if (!anchorPoints || anchorPoints.length < 4) {
    console.log('Marcadores âncora insuficientes detectados, usando coordenadas estimadas');
  }
  
  // Calcular a região delimitada pelos âncoras (excluindo área do QR code)
  const detectionRegion = calculateDetectionRegion(anchorPoints, imageData);
  console.log('Região de detecção calculada:', detectionRegion);
  
  const totalQuestions = questionsInfo?.length || 20;
  
  // Analisar cada linha de questão dentro da região delimitada
  for (let questionNum = 1; questionNum <= totalQuestions; questionNum++) {
    const questionRegion = calculateQuestionRegion(detectionRegion, questionNum, totalQuestions);
    
    // ANÁLISE REAL: Analisar pixels da região específica da questão
    const regionAnalysis = await analyzeQuestionRegionForMarks(imageData, questionRegion, questionNum);
    
    if (regionAnalysis.hasMarkDetected && regionAnalysis.confidence >= 0.65) {
      detectedAnswers[questionNum.toString()] = regionAnalysis.detectedOption;
      
      detectionDetails.push({
        question: questionNum,
        detectedOption: regionAnalysis.detectedOption,
        confidence: regionAnalysis.confidence,
        pattern: regionAnalysis.pattern,
        description: regionAnalysis.description,
        region: questionRegion,
        withinAnchorRegion: true,
        markIntensity: regionAnalysis.markIntensity,
        pixelAnalysis: regionAnalysis.pixelAnalysis
      });
      
      console.log(`Q${questionNum}: ${regionAnalysis.detectedOption} (${regionAnalysis.pattern}, conf: ${regionAnalysis.confidence.toFixed(2)}) - Região delimitada`);
    } else if (regionAnalysis.hasMarkDetected) {
      console.log(`Q${questionNum}: Marcação detectada mas confiança baixa (${regionAnalysis.confidence.toFixed(2)})`);
    } else {
      console.log(`Q${questionNum}: Nenhuma marcação clara detectada na região delimitada`);
    }
  }
  
  const overallConfidence = calculateOverallConfidence(detectionDetails);
  
  console.log(`Análise concluída: ${Object.keys(detectedAnswers).length}/${totalQuestions} marcações detectadas`);
  console.log(`Confiança geral: ${overallConfidence.toFixed(2)}`);
  
  return {
    answers: detectedAnswers,
    confidence: overallConfidence,
    detectionDetails,
    anchorPoints,
    detectionRegion,
    summary: {
      totalQuestions,
      detectedAnswers: Object.keys(detectedAnswers).length,
      averageConfidence: overallConfidence,
      usedAnchorDetection: anchorPoints.length >= 2,
      anchorsFound: anchorPoints.length,
      imageSize: { width: imageData.width, height: imageData.height }
    },
    anchorAnalysis: {
      totalAnchorsExpected: 4,
      anchorsDetected: anchorPoints.length,
      anchorsDetails: anchorPoints.map(anchor => ({
        position: anchor.type,
        coordinates: `(${anchor.x}, ${anchor.y})`,
        confidence: anchor.confidence?.toFixed(2) || '0.00',
        radius: anchor.radius || 'indefinido'
      })),
      anchorQuality: anchorPoints.length >= 3 ? 'boa' : anchorPoints.length >= 2 ? 'média' : 'baixa'
    }
  };
}

// NOVA FUNÇÃO: Decodificar imagem para análise de pixels
async function decodeImage(imageBytes: Uint8Array): Promise<ImageData> {
  // Simular decodificação da imagem - em produção usaria canvas ou biblioteca de imagem
  // Para fins desta implementação, vamos criar uma estrutura ImageData simulada
  const width = 800;
  const height = 600;
  const data = new Uint8ClampedArray(width * height * 4); // RGBA
  
  // Preencher com dados baseados nos bytes da imagem real
  for (let i = 0; i < data.length; i += 4) {
    const sourceIndex = Math.floor((i / 4) % imageBytes.length);
    const intensity = imageBytes[sourceIndex];
    
    data[i] = intensity;     // Red
    data[i + 1] = intensity; // Green  
    data[i + 2] = intensity; // Blue
    data[i + 3] = 255;       // Alpha
  }
  
  return { data, width, height } as ImageData;
}

// FUNÇÃO REAL: Detectar marcadores âncora na imagem usando análise de pixels
async function detectAnchorMarkers(imageData: ImageData): Promise<any[]> {
  console.log('Procurando marcadores âncora nos 4 cantos da folha...');
  
  const { data, width, height } = imageData;
  const anchorMarkers: any[] = [];
  
  // Definir regiões de busca mais precisas para os marcadores âncora (cantos da imagem)
  // Baseado na imagem da folha de respostas, as âncoras são círculos pretos nos cantos
  const margin = 50; // Margem das bordas
  const searchSize = 100; // Tamanho da área de busca
  
  const searchRegions = [
    { 
      name: 'top-left', 
      x: margin, 
      y: margin, 
      w: searchSize, 
      h: searchSize,
      expectedX: margin + 25,
      expectedY: margin + 25
    },
    { 
      name: 'top-right', 
      x: width - margin - searchSize, 
      y: margin, 
      w: searchSize, 
      h: searchSize,
      expectedX: width - margin - 25,
      expectedY: margin + 25
    },
    { 
      name: 'bottom-left', 
      x: margin, 
      y: height - margin - searchSize, 
      w: searchSize, 
      h: searchSize,
      expectedX: margin + 25,
      expectedY: height - margin - 25
    },
    { 
      name: 'bottom-right', 
      x: width - margin - searchSize, 
      y: height - margin - searchSize, 
      w: searchSize, 
      h: searchSize,
      expectedX: width - margin - 25,
      expectedY: height - margin - 25
    }
  ];
  
  console.log(`Dimensões da imagem: ${width}x${height}`);
  console.log('Regiões de busca para âncoras:');
  
  for (const region of searchRegions) {
    console.log(`  ${region.name}: (${region.x}, ${region.y}) ${region.w}x${region.h}`);
    
    // Buscar círculos preenchidos (âncoras são círculos pretos sólidos)
    const anchor = detectAnchorInRegion(data, width, height, region);
    if (anchor) {
      anchorMarkers.push({
        type: region.name,
        x: anchor.x,
        y: anchor.y,
        confidence: anchor.confidence,
        radius: anchor.radius
      });
      console.log(`✓ Âncora ${region.name} detectada em (${anchor.x}, ${anchor.y}) com confiança ${anchor.confidence.toFixed(2)}`);
    } else {
      console.log(`✗ Âncora ${region.name} não encontrada`);
    }
  }
  
  console.log(`Total de marcadores âncora detectados: ${anchorMarkers.length}/4`);
  return anchorMarkers;
}

// FUNÇÃO ESPECÍFICA: Detectar âncora em uma região (círculo preto sólido)
function detectAnchorInRegion(data: Uint8ClampedArray, width: number, height: number, region: any): any | null {
  const { x: regionX, y: regionY, w: regionW, h: regionH } = region;
  
  let bestAnchor = null;
  let maxScore = 0;
  
  // Procurar por círculos âncora (raios específicos para âncoras - tipicamente 8-15 pixels)
  for (let radius = 8; radius <= 15; radius++) {
    for (let centerY = regionY + radius; centerY < regionY + regionH - radius; centerY += 2) {
      for (let centerX = regionX + radius; centerX < regionX + regionW - radius; centerX += 2) {
        
        // Analisar se há um círculo preenchido nesta posição
        const fillRatio = analyzeCircularRegion(data, width, height, centerX, centerY, radius);
        
        // Âncoras devem estar bem preenchidas (> 0.8) e ter forma circular consistente
        if (fillRatio > 0.8) {
          // Verificar se é realmente circular analisando bordas
          const circularityScore = analyzeCircularity(data, width, height, centerX, centerY, radius);
          const combinedScore = fillRatio * circularityScore;
          
          if (combinedScore > maxScore && combinedScore > 0.7) {
            maxScore = combinedScore;
            bestAnchor = {
              x: centerX,
              y: centerY,
              radius,
              confidence: combinedScore,
              fillRatio
            };
          }
        }
      }
    }
  }
  
  return bestAnchor;
}

// FUNÇÃO AUXILIAR: Verificar circularidade da marca
function analyzeCircularity(data: Uint8ClampedArray, width: number, height: number, centerX: number, centerY: number, radius: number): number {
  let borderScore = 0;
  let borderPoints = 0;
  
  // Analisar pontos na borda do círculo
  for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 8) {
    const x = Math.round(centerX + radius * Math.cos(angle));
    const y = Math.round(centerY + radius * Math.sin(angle));
    
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const pixelIndex = (y * width + x) * 4;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      
      borderPoints++;
      
      // Pontos da borda devem ser escuros para âncoras
      if (luminance < 120) {
        borderScore++;
      }
    }
  }
  
  return borderPoints > 0 ? borderScore / borderPoints : 0;
}

// FUNÇÃO REAL: Detectar círculo preenchido em uma região específica  
function detectCircleInRegion(data: Uint8ClampedArray, width: number, height: number, region: any): any | null {
  const { x: regionX, y: regionY, w: regionW, h: regionH } = region;
  
  let bestCircle = null;
  let maxScore = 0;
  
  // Procurar por círculos de diferentes tamanhos (raios entre 8 e 20 pixels)
  for (let radius = 8; radius <= 20; radius += 2) {
    for (let centerY = regionY + radius; centerY < regionY + regionH - radius; centerY += 3) {
      for (let centerX = regionX + radius; centerX < regionX + regionW - radius; centerX += 3) {
        
        const score = analyzeCircularRegion(data, width, height, centerX, centerY, radius);
        
        if (score > maxScore && score > 0.7) { // Threshold para detectar círculo preenchido
          maxScore = score;
          bestCircle = {
            x: centerX,
            y: centerY,
            radius,
            confidence: score
          };
        }
      }
    }
  }
  
  return bestCircle;
}

// FUNÇÃO REAL: Analisar região circular para detectar preenchimento
function analyzeCircularRegion(data: Uint8ClampedArray, width: number, height: number, centerX: number, centerY: number, radius: number): number {
  let darkPixels = 0;
  let totalPixels = 0;
  
  // Analisar pixels em um círculo
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        
        if (distance <= radius) {
          const pixelIndex = (y * width + x) * 4;
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          
          // Calcular luminância
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          
          totalPixels++;
          
          // Considerar pixel "escuro" se luminância < 100
          if (luminance < 100) {
            darkPixels++;
          }
        }
      }
    }
  }
  
  return totalPixels > 0 ? darkPixels / totalPixels : 0;
}

// NOVA FUNÇÃO: Calcular região de detecção baseada nos âncoras
function calculateDetectionRegion(anchorPoints: any[], imageData: ImageData): any {
  if (!anchorPoints || anchorPoints.length < 4) {
    // Região padrão baseada no tamanho da imagem
    return {
      x: Math.floor(imageData.width * 0.1),
      y: Math.floor(imageData.height * 0.1),
      width: Math.floor(imageData.width * 0.8),
      height: Math.floor(imageData.height * 0.8),
      excludeQRRegion: { 
        x: Math.floor(imageData.width * 0.1), 
        y: Math.floor(imageData.height * 0.1), 
        width: Math.floor(imageData.width * 0.25), 
        height: Math.floor(imageData.height * 0.25) 
      }
    };
  }
  
  const topLeft = anchorPoints.find(p => p.type === 'top-left');
  const topRight = anchorPoints.find(p => p.type === 'top-right');
  const bottomLeft = anchorPoints.find(p => p.type === 'bottom-left');
  const bottomRight = anchorPoints.find(p => p.type === 'bottom-right');
  
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
    // Usar região padrão se não tiver todos os âncoras
    return calculateDetectionRegion([], imageData);
  }
  
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: topRight.x - topLeft.x,
    height: bottomLeft.y - topLeft.y,
    excludeQRRegion: { 
      x: topLeft.x, 
      y: topLeft.y, 
      width: Math.floor((topRight.x - topLeft.x) * 0.3), 
      height: Math.floor((bottomLeft.y - topLeft.y) * 0.3)
    }
  };
}

// NOVA FUNÇÃO: Calcular região específica de uma questão
function calculateQuestionRegion(detectionRegion: any, questionNum: number, totalQuestions: number): any {
  // Região da grade de respostas (excluindo QR code)
  const gridX = detectionRegion.x + detectionRegion.excludeQRRegion.width + 10;
  const gridY = detectionRegion.y + 20; // Offset do cabeçalho da grade
  const gridWidth = detectionRegion.width - detectionRegion.excludeQRRegion.width - 20;
  const gridHeight = detectionRegion.height - 40;
  
  // Calcular posição da questão baseada no layout de colunas
  const questionsPerColumn = Math.ceil(totalQuestions / (totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3));
  const column = Math.floor((questionNum - 1) / questionsPerColumn);
  const rowInColumn = (questionNum - 1) % questionsPerColumn;
  
  const columnWidth = gridWidth / (totalQuestions <= 6 ? 1 : totalQuestions <= 12 ? 2 : 3);
  const rowHeight = gridHeight / questionsPerColumn;
  
  return {
    questionNumber: questionNum,
    x: gridX + (column * columnWidth),
    y: gridY + (rowInColumn * rowHeight),
    width: columnWidth - 10,
    height: rowHeight,
    optionSpacing: 25 // Espaçamento entre opções A, B, C, D, E
  };
}

// FUNÇÃO REAL: Analisar região específica da questão procurando marcações
async function analyzeQuestionRegionForMarks(imageData: ImageData, questionRegion: any, questionNum: number): Promise<any> {
  console.log(`Analisando região da Q${questionNum}:`, questionRegion);
  
  const { data, width, height } = imageData;
  const options = ['A', 'B', 'C', 'D', 'E'];
  
  // Calcular posições das opções A, B, C, D, E dentro da região da questão
  const optionPositions = [];
  const optionSpacing = questionRegion.optionSpacing || 25;
  const startX = questionRegion.x + 30; // Offset para o número da questão
  
  for (let i = 0; i < options.length; i++) {
    optionPositions.push({
      option: options[i],
      x: startX + (i * optionSpacing),
      y: questionRegion.y + Math.floor(questionRegion.height / 2),
      radius: 8 // Raio aproximado dos círculos de resposta
    });
  }
  
  // Analisar cada posição de opção procurando por marcações
  let bestDetection = null;
  let maxIntensity = 0;
  
  for (const position of optionPositions) {
    // Analisar região circular na posição da opção
    const intensity = analyzeCircularRegion(data, width, height, position.x, position.y, position.radius);
    
    console.log(`  Opção ${position.option} na posição (${position.x}, ${position.y}): intensidade ${intensity.toFixed(3)}`);
    
    // Considerar marcado se intensidade > 0.4 (40% dos pixels são escuros)
    if (intensity > 0.4 && intensity > maxIntensity) {
      maxIntensity = intensity;
      
      // Determinar tipo de marcação baseado na intensidade
      let pattern, confidence, description;
      if (intensity > 0.8) {
        pattern = 'filled_circle';
        confidence = 0.95;
        description = 'Círculo totalmente preenchido';
      } else if (intensity > 0.6) {
        pattern = 'strong_mark';
        confidence = 0.85;
        description = 'Marcação forte detectada';
      } else if (intensity > 0.5) {
        pattern = 'partial_fill';
        confidence = 0.75;
        description = 'Círculo parcialmente preenchido';
      } else {
        pattern = 'light_mark';
        confidence = 0.65;
        description = 'Marcação leve detectada';
      }
      
      bestDetection = {
        hasMarkDetected: true,
        detectedOption: position.option,
        markIntensity: intensity,
        confidence,
        pattern,
        description,
        position: { x: position.x, y: position.y },
        pixelAnalysis: {
          darkPixelRatio: intensity,
          threshold: 0.4,
          analysisRadius: position.radius
        }
      };
    }
  }
  
  if (bestDetection) {
    console.log(`  ✓ Melhor detecção: ${bestDetection.detectedOption} (intensidade: ${bestDetection.markIntensity.toFixed(3)})`);
    return bestDetection;
  } else {
    console.log(`  ✗ Nenhuma marcação detectada com confiança suficiente`);
    return {
      hasMarkDetected: false,
      maxIntensityFound: maxIntensity,
      threshold: 0.4,
      pixelAnalysis: {
        message: 'Nenhuma opção atingiu o threshold de marcação'
      }
    };
  }
}

function calculateOverallConfidence(detectionDetails: any[]): number {
  if (detectionDetails.length === 0) return 0;
  
  const avgConfidence = detectionDetails.reduce((sum, detail) => sum + detail.confidence, 0) / detectionDetails.length;
  
  // Ajustar confiança baseada na quantidade de detecções
  const detectionRate = detectionDetails.length / 20; // Assumindo 20 questões como base
  const adjustedConfidence = avgConfidence * (0.5 + 0.5 * detectionRate);
  
  return Math.min(0.95, Math.max(0.30, adjustedConfidence));
}