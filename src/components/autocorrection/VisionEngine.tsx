import { useRef, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
}

interface Anchor {
  center: Point;
  area: number;
}

interface VisionResult {
  success: boolean;
  transformMatrix?: number[][];
  detectedPoints?: Point[];
  contentDimensions?: { width: number; height: number };
  contentOffset?: Point;
  debugCanvas?: HTMLCanvasElement;
}

interface FillingData {
  [question: string]: {
    [option: string]: number; // percentage filled
  };
}

export class VisionEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  // Encontrar âncoras circulares dinamicamente
  findAnchorsInFrame(imageData: ImageData): VisionResult {
    const { width, height, data } = imageData;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.putImageData(imageData, 0, 0);

    // Converter para escala de cinza
    const grayData = this.convertToGrayscale(data, width, height);
    
    // Aplicar blur gaussiano
    const blurredData = this.gaussianBlur(grayData, width, height);
    
    // Threshold adaptativo
    const thresholdData = this.adaptiveThreshold(blurredData, width, height);
    
    // Operações morfológicas
    const cleanData = this.morphologyClose(thresholdData, width, height);
    
    // Encontrar contornos e detectar círculos
    const potentialMarkers = this.findCircularContours(cleanData, width, height);
    
    if (potentialMarkers.length < 4) {
      return { success: false };
    }

    // Filtrar e selecionar as 4 melhores âncoras
    const selectedAnchors = this.selectBestAnchors(potentialMarkers, grayData, width, height);
    
    if (!selectedAnchors) {
      return { success: false };
    }

    // Ordenar pontos (top-left, top-right, bottom-right, bottom-left)
    const orderedPoints = this.orderPoints(selectedAnchors);
    
    return {
      success: true,
      detectedPoints: orderedPoints
    };
  }

  // Alinhar gabarito usando transformação perspectiva
  alignAnswerSheet(imageData: ImageData, layoutData: any): VisionResult {
    const anchorResult = this.findAnchorsInFrame(imageData);
    
    if (!anchorResult.success || !anchorResult.detectedPoints) {
      return { success: false };
    }

    // Obter âncoras do layout
    const layoutAnchors = layoutData.anchors
      .map((a: any) => ({ x: a.x, y: a.y }))
      .sort((a: Point, b: Point) => (a.y - b.y) || (a.x - b.x));

    if (layoutAnchors.length !== 4) {
      return { success: false };
    }

    const [tl, tr, bl, br] = layoutAnchors;
    const contentWidth = tr.x - tl.x;
    const contentHeight = bl.y - tl.y;
    const contentOffset = tl;

    // Pontos de destino para a transformação
    const destPoints = [
      { x: 0, y: 0 },
      { x: contentWidth, y: 0 },
      { x: contentWidth, y: contentHeight },
      { x: 0, y: contentHeight }
    ];

    const transformMatrix = this.calculatePerspectiveTransform(
      anchorResult.detectedPoints,
      destPoints
    );

    return {
      success: true,
      transformMatrix,
      detectedPoints: anchorResult.detectedPoints,
      contentDimensions: { width: contentWidth, height: contentHeight },
      contentOffset
    };
  }

  // Ler respostas da imagem alinhada
  readAnswersFromAlignedImage(
    imageData: ImageData,
    layoutData: any,
    contentOffset: Point
  ): FillingData {
    const { width, height, data } = imageData;
    
    // Converter para escala de cinza e aplicar threshold
    const grayData = this.convertToGrayscale(data, width, height);
    const binaryData = this.adaptiveThreshold(grayData, width, height);

    const fillingData: FillingData = {};

    Object.entries(layoutData.fieldBlocks).forEach(([questionId, fieldInfo]: [string, any]) => {
      fillingData[questionId] = {};

      if (fieldInfo.bubbleCoordinates) {
        fieldInfo.bubbleCoordinates.forEach((bubble: any) => {
          const x = Math.round(bubble.x - contentOffset.x);
          const y = Math.round(bubble.y - contentOffset.y);
          const w = Math.round(bubble.width);
          const h = Math.round(bubble.height);

          // Extrair ROI da bolha
          const roi = this.extractROI(binaryData, width, height, x, y, w, h);
          
          if (roi.length > 0) {
            const filledPixels = roi.filter(pixel => pixel > 128).length;
            const fillPercentage = filledPixels / roi.length;
            fillingData[questionId][bubble.value] = fillPercentage;
          } else {
            fillingData[questionId][bubble.value] = 0.0;
          }
        });
      }
    });

    return fillingData;
  }

  // Utilitários de processamento de imagem
  private convertToGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const grayData = new Uint8ClampedArray(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grayData[i / 4] = gray;
    }
    
    return grayData;
  }

  private gaussianBlur(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const kernel = [1, 4, 6, 4, 1];
    const kernelSum = kernel.reduce((a, b) => a + b, 0);
    const blurred = new Uint8ClampedArray(data.length);

    // Blur horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = 0; k < kernel.length; k++) {
          const px = Math.max(0, Math.min(width - 1, x + k - 2));
          sum += data[y * width + px] * kernel[k];
        }
        blurred[y * width + x] = sum / kernelSum;
      }
    }

    // Blur vertical
    const result = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = 0; k < kernel.length; k++) {
          const py = Math.max(0, Math.min(height - 1, y + k - 2));
          sum += blurred[py * width + x] * kernel[k];
        }
        result[y * width + x] = sum / kernelSum;
      }
    }

    return result;
  }

  private adaptiveThreshold(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);
    const blockSize = 21;
    const C = 5;
    const halfBlock = Math.floor(blockSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;

        for (let ky = Math.max(0, y - halfBlock); ky <= Math.min(height - 1, y + halfBlock); ky++) {
          for (let kx = Math.max(0, x - halfBlock); kx <= Math.min(width - 1, x + halfBlock); kx++) {
            sum += data[ky * width + kx];
            count++;
          }
        }

        const mean = sum / count;
        const threshold = mean - C;
        result[y * width + x] = data[y * width + x] > threshold ? 0 : 255;
      }
    }

    return result;
  }

  private morphologyClose(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    // Implementação simplificada de close morfológico (dilatação + erosão)
    const kernel = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ];

    // Dilatação
    const dilated = this.dilate(data, width, height, kernel);
    
    // Erosão
    const result = this.erode(dilated, width, height, kernel);
    
    return result;
  }

  private dilate(data: Uint8ClampedArray, width: number, height: number, kernel: number[][]): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);
    const kh = kernel.length;
    const kw = kernel[0].length;
    const halfKh = Math.floor(kh / 2);
    const halfKw = Math.floor(kw / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0;
        
        for (let ky = 0; ky < kh; ky++) {
          for (let kx = 0; kx < kw; kx++) {
            if (kernel[ky][kx] === 0) continue;
            
            const py = y + ky - halfKh;
            const px = x + kx - halfKw;
            
            if (py >= 0 && py < height && px >= 0 && px < width) {
              maxVal = Math.max(maxVal, data[py * width + px]);
            }
          }
        }
        
        result[y * width + x] = maxVal;
      }
    }

    return result;
  }

  private erode(data: Uint8ClampedArray, width: number, height: number, kernel: number[][]): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);
    const kh = kernel.length;
    const kw = kernel[0].length;
    const halfKh = Math.floor(kh / 2);
    const halfKw = Math.floor(kw / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 255;
        
        for (let ky = 0; ky < kh; ky++) {
          for (let kx = 0; kx < kw; kx++) {
            if (kernel[ky][kx] === 0) continue;
            
            const py = y + ky - halfKh;
            const px = x + kx - halfKw;
            
            if (py >= 0 && py < height && px >= 0 && px < width) {
              minVal = Math.min(minVal, data[py * width + px]);
            }
          }
        }
        
        result[y * width + x] = minVal;
      }
    }

    return result;
  }

  private findCircularContours(data: Uint8ClampedArray, width: number, height: number): Anchor[] {
    const visited = new Set<number>();
    const potentialMarkers: Anchor[] = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (visited.has(idx) || data[idx] === 0) continue;

        const contour = this.traceContour(data, width, height, x, y, visited);
        
        if (contour.length < 8) continue;

        const area = contour.length;
        if (area < 95) continue;

        // Calcular circularidade
        const perimeter = this.calculatePerimeter(contour);
        if (perimeter === 0) continue;

        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        
        if (circularity > 0.8 && circularity < 1.2) {
          const center = this.calculateCentroid(contour);
          potentialMarkers.push({ center, area });
        }
      }
    }

    return potentialMarkers;
  }

  private traceContour(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    startX: number,
    startY: number,
    visited: Set<number>
  ): Point[] {
    const contour: Point[] = [];
    const stack: Point[] = [{ x: startX, y: startY }];
    
    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      const idx = y * width + x;
      
      if (visited.has(idx) || x < 0 || x >= width || y < 0 || y >= height || data[idx] === 0) {
        continue;
      }
      
      visited.add(idx);
      contour.push({ x, y });
      
      // Adicionar vizinhos 8-conectados
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          stack.push({ x: x + dx, y: y + dy });
        }
      }
    }
    
    return contour;
  }

  private calculatePerimeter(contour: Point[]): number {
    if (contour.length < 2) return 0;
    
    let perimeter = 0;
    for (let i = 0; i < contour.length; i++) {
      const current = contour[i];
      const next = contour[(i + 1) % contour.length];
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    
    return perimeter;
  }

  private calculateCentroid(contour: Point[]): Point {
    let sumX = 0, sumY = 0;
    
    contour.forEach(point => {
      sumX += point.x;
      sumY += point.y;
    });
    
    return {
      x: Math.round(sumX / contour.length),
      y: Math.round(sumY / contour.length)
    };
  }

  private selectBestAnchors(markers: Anchor[], grayData: Uint8ClampedArray, width: number, height: number): Point[] | null {
    if (markers.length < 4) return null;

    // Ordenar por área
    markers.sort((a, b) => a.area - b.area);

    // Tentar grupos de 4 âncoras com áreas similares
    for (let i = 0; i <= markers.length - 4; i++) {
      const group = markers.slice(i, i + 4);
      const minArea = group[0].area;
      const maxArea = group[3].area;

      if (maxArea < minArea * 1.6) {
        const centers = group.map(m => m.center);
        
        // Verificar se são âncoras válidas (centro escuro, anel claro)
        const isValidGroup = centers.every(center => {
          const samplingRadius = Math.round(Math.sqrt(minArea / Math.PI) * 0.7);
          
          if (center.y >= height || center.x >= width || 
              center.y + samplingRadius >= height || 
              center.x + samplingRadius >= width) {
            return false;
          }

          const centerColor = grayData[center.y * width + center.x];
          const ringColor = grayData[(center.y + samplingRadius) * width + (center.x + samplingRadius)];
          
          return centerColor < 120 && ringColor > 130;
        });

        if (isValidGroup) {
          return centers;
        }
      }
    }

    return null;
  }

  private orderPoints(points: Point[]): Point[] {
    // Ordenar pontos como: top-left, top-right, bottom-right, bottom-left
    const sum = points.map(p => p.x + p.y);
    const diff = points.map(p => p.x - p.y);

    const tl = points[sum.indexOf(Math.min(...sum))];
    const br = points[sum.indexOf(Math.max(...sum))];
    const tr = points[diff.indexOf(Math.min(...diff))];
    const bl = points[diff.indexOf(Math.max(...diff))];

    return [tl, tr, br, bl];
  }

  private calculatePerspectiveTransform(srcPoints: Point[], dstPoints: Point[]): number[][] {
    // Implementação simplificada da transformação perspectiva
    // Em uma implementação real, isso seria mais complexo
    const matrix: number[][] = [];
    
    // Por simplicidade, retornando uma matriz identidade
    // Em produção, seria necessário implementar o cálculo completo
    for (let i = 0; i < 3; i++) {
      matrix[i] = [];
      for (let j = 0; j < 3; j++) {
        matrix[i][j] = i === j ? 1 : 0;
      }
    }

    return matrix;
  }

  private extractROI(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    w: number,
    h: number
  ): number[] {
    const roi: number[] = [];
    
    for (let row = y; row < y + h && row < height; row++) {
      for (let col = x; col < x + w && col < width; col++) {
        if (row >= 0 && col >= 0) {
          roi.push(data[row * width + col]);
        }
      }
    }
    
    return roi;
  }
}