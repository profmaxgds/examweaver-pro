import { useState, useEffect } from 'react';

interface BubbleCoordinate {
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
}

interface FieldBlock {
  origin: { x: number; y: number };
  type?: string;
  essayDimensions?: { width: number; height: number };
  direction: string;
  bubbleValues: string[];
  bubbleCoordinates: BubbleCoordinate[];
  borderWidth: number;
  bubblesGap?: number;
}

interface LayoutData {
  pageDimensions: {
    width: number;
    height: number;
    marginLeft: number;
    marginTop: number;
    marginBottom: number;
  };
  bubbleDimensions: {
    contentWidth: number;
    contentHeight: number;
    borderWidth: number;
    totalWidth: number;
    totalHeight: number;
  };
  fieldBlocks: Record<string, FieldBlock>;
  anchors: Array<{
    class: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

interface LayoutExtractorProps {
  htmlContent: string;
  onLayoutExtracted: (layout: LayoutData) => void;
}

export const LayoutExtractor = ({ htmlContent, onLayoutExtracted }: LayoutExtractorProps) => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedLayout, setExtractedLayout] = useState<LayoutData | null>(null);

  const extractLayoutFromHTML = (): LayoutData | null => {
    if (!htmlContent) return null;

    // Criar um DOM parser para processar o HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Buscar elementos necessários
    const answerRows = doc.querySelectorAll('.answer-row');
    const anchors = doc.querySelectorAll('[class*="anchor-"]');
    const styleTag = doc.querySelector('style');
    const cssRules = styleTag?.textContent || '';
    const gridSection = doc.querySelector('.answer-grid-section');

    // Constantes alinhadas com layout.ts
    const pageWidth = 595;
    const pageHeight = 842;
    const bubbleWidth = 12;
    const bubbleHeight = 12;
    const borderWidth = 1;
    const bubbleGap = 15.5;
    const rowGap = 5;
    const totalBubbleWidth = bubbleWidth + 2 * borderWidth;
    const totalBubbleHeight = bubbleHeight + 2 * borderWidth;
    const qNumberWidth = 34;
    const qNumberMarginRight = 10;
    const qrCodeWidth = 120;
    const pagePadding = 58;
    const gridWidth = 174.25;
    const gridHeight = answerRows.length * (totalBubbleHeight + rowGap) - rowGap;

    // Função para extrair coordenadas do estilo
    const extractCoordinates = (style: string, className: string, cssRules: string) => {
      let x = 0, y = 0;
      const width = totalBubbleWidth;
      const height = totalBubbleHeight;

      if (style) {
        const styleLC = style.toLowerCase().trim();
        const xMatch = styleLC.match(/left:\s*([-]?\d+\.?\d*)\s*px/);
        const yMatch = styleLC.match(/top:\s*([-]?\d+\.?\d*)\s*px/);
        const rightMatch = styleLC.match(/right:\s*([-]?\d+\.?\d*)\s*px/);
        const bottomMatch = styleLC.match(/bottom:\s*([-]?\d+\.?\d*)\s*px/);

        if (xMatch) x = parseFloat(xMatch[1]);
        else if (rightMatch) x = gridWidth - parseFloat(rightMatch[1]);
        
        if (yMatch) y = parseFloat(yMatch[1]);
        else if (bottomMatch) y = gridHeight - parseFloat(bottomMatch[1]);
      }

      // Fallback para posições padrão das âncoras
      if (x === 0 && y === 0 && className) {
        if (className.includes('top-left')) { x = -7; y = -7; }
        else if (className.includes('top-right')) { x = gridWidth + 7; y = -7; }
        else if (className.includes('bottom-left')) { x = -7; y = gridHeight + 7; }
        else if (className.includes('bottom-right')) { x = gridWidth + 7; y = gridHeight + 7; }
      }

      return { x, y, width, height };
    };

    // Calcular margens
    const marginLeft = pagePadding + qrCodeWidth;
    const marginTop = 80 + pagePadding;
    const marginBottom = pageHeight - (marginTop + gridHeight + totalBubbleHeight);

    // Extrair âncoras
    const anchorBlocks = Array.from(anchors).map(anchor => {
      const style = (anchor as Element).getAttribute('style') || '';
      const className = (anchor as Element).className || '';
      const coords = extractCoordinates(style, className, cssRules);
      
      return {
        class: className,
        x: Math.round(coords.x + marginLeft * 100) / 100,
        y: Math.round(coords.y + marginTop * 100) / 100,
        width: Math.round(coords.width * 100) / 100,
        height: Math.round(coords.height * 100) / 100
      };
    });

    // Função para verificar preenchimento preto
    const isBlackFill = (style: string, classes: string[], cssRules: string): boolean => {
      if (!style) style = '';
      const styleLC = style.toLowerCase().replace(/\s/g, '');
      
      const blackPatterns = [
        'background-color:#000000', 'background-color:#000', 'background:#000000',
        'background:#000', 'background-color:black', 'background:black',
        'background-color:rgb(0,0,0)', 'background:rgb(0,0,0)'
      ];
      
      if (blackPatterns.some(pattern => styleLC.includes(pattern))) {
        return true;
      }

      // Verificar nas classes CSS
      if (classes && cssRules) {
        for (const cls of classes) {
          const classPatterns = [
            new RegExp(`\\.${cls}\\s*{[^}]*background-color:\\s*#000000`, 'i'),
            new RegExp(`\\.${cls}\\s*{[^}]*background-color:\\s*#000`, 'i'),
            new RegExp(`\\.${cls}\\s*{[^}]*background-color:\\s*black`, 'i'),
            new RegExp(`\\.${cls}\\s*{[^}]*background:\\s*#000000`, 'i'),
            new RegExp(`\\.${cls}\\s*{[^}]*background:\\s*#000`, 'i'),
            new RegExp(`\\.${cls}\\s*{[^}]*background:\\s*black`, 'i')
          ];
          
          if (classPatterns.some(pattern => pattern.test(cssRules))) {
            return true;
          }
        }
      }
      
      return false;
    };

    // Extrair field blocks
    const fieldBlocks: Record<string, FieldBlock> = {};
    let currentY = marginTop;

    Array.from(answerRows).forEach(row => {
      const qNumberTag = row.querySelector('.q-number');
      if (!qNumberTag) return;

      const qNumber = `Q${parseInt(qNumberTag.textContent?.replace('.', '') || '0')}`;
      const bubbles = row.querySelectorAll('.bubble');
      const essayIndicator = row.querySelector('.essay-indicator');

      if (essayIndicator) {
        const essayLines = row.querySelectorAll('.essay-line');
        const numLines = essayLines.length || 5;
        const essayHeight = numLines * 2.5;
        const essayWidth = 120;

        fieldBlocks[qNumber] = {
          origin: { x: marginLeft + qNumberWidth + qNumberMarginRight, y: currentY },
          type: 'essay',
          essayDimensions: { width: essayWidth, height: essayHeight },
          direction: 'none',
          bubbleValues: [],
          bubbleCoordinates: [],
          borderWidth
        };

        currentY += essayHeight + rowGap;
      } else if (bubbles.length > 0) {
        const bubbleValues: string[] = [];
        const bubbleStyles: string[] = [];

        Array.from(bubbles).forEach(bubble => {
          bubbleValues.push(bubble.textContent?.trim() || '');
          const style = (bubble as Element).getAttribute('style') || '';
          const classes = Array.from(bubble.classList);
          const isBlack = isBlackFill(style, classes, cssRules);
          bubbleStyles.push(isBlack ? 'black' : 'other');
        });

        let currentX = marginLeft + qNumberWidth + qNumberMarginRight;
        const bubbleCoords: BubbleCoordinate[] = [];

        for (let i = 0; i < bubbleValues.length; i++) {
          bubbleCoords.push({
            value: bubbleValues[i],
            x: currentX,
            y: currentY,
            width: totalBubbleWidth,
            height: totalBubbleHeight,
            fill: bubbleStyles[i]
          });
          currentX += totalBubbleWidth + bubbleGap;
        }

        fieldBlocks[qNumber] = {
          origin: { x: marginLeft + qNumberWidth + qNumberMarginRight, y: currentY },
          bubblesGap: bubbleGap,
          direction: 'horizontal',
          bubbleValues,
          bubbleCoordinates: bubbleCoords,
          borderWidth
        };

        currentY += totalBubbleHeight + rowGap;
      }
    });

    return {
      pageDimensions: {
        width: pageWidth,
        height: pageHeight,
        marginLeft: Math.round(marginLeft * 100) / 100,
        marginTop: Math.round(marginTop * 100) / 100,
        marginBottom: Math.round(marginBottom * 100) / 100
      },
      bubbleDimensions: {
        contentWidth: bubbleWidth,
        contentHeight: bubbleHeight,
        borderWidth,
        totalWidth: totalBubbleWidth,
        totalHeight: totalBubbleHeight
      },
      fieldBlocks,
      anchors: anchorBlocks
    };
  };

  const handleExtractLayout = async () => {
    setIsExtracting(true);
    try {
      const layout = extractLayoutFromHTML();
      if (layout) {
        setExtractedLayout(layout);
        onLayoutExtracted(layout);
        console.log('✅ Layout extraído com sucesso:', layout);
      } else {
        console.error('❌ Falha ao extrair layout do HTML');
      }
    } catch (error) {
      console.error('❌ Erro ao extrair layout:', error);
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    if (htmlContent) {
      handleExtractLayout();
    }
  }, [htmlContent]);

  return (
    <div className="p-4 border rounded-lg bg-card">
      <h3 className="text-lg font-semibold mb-4">Extração de Layout</h3>
      
      {isExtracting && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          Extraindo layout do HTML...
        </div>
      )}

      {extractedLayout && (
        <div className="space-y-2 text-sm">
          <div className="text-green-600">✅ Layout extraído com sucesso</div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <strong>Dimensões da página:</strong>
              <div>{extractedLayout.pageDimensions.width}x{extractedLayout.pageDimensions.height}</div>
            </div>
            <div>
              <strong>Questões encontradas:</strong>
              <div>{Object.keys(extractedLayout.fieldBlocks).length}</div>
            </div>
            <div>
              <strong>Âncoras encontradas:</strong>
              <div>{extractedLayout.anchors.length}</div>
            </div>
            <div>
              <strong>Margens:</strong>
              <div>L:{extractedLayout.pageDimensions.marginLeft}, T:{extractedLayout.pageDimensions.marginTop}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};