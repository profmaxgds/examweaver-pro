// Função para binarizar e pré-processar imagem
export const preprocessImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // Usar resolução otimizada
      const maxDimension = 1200;
      let { width, height } = img;
      
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Desenhar imagem original
      ctx.drawImage(img, 0, 0, width, height);
      
      // Obter dados da imagem
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Aplicar binarização (Otsu threshold simplificado)
      let threshold = 128;
      const histogram = new Array(256).fill(0);
      
      // Calcular histograma
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        histogram[gray]++;
      }
      
      // Algoritmo de Otsu simplificado
      let total = width * height;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * histogram[t];
      
      let sumB = 0;
      let wB = 0;
      let wF = 0;
      let varMax = 0;
      
      for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        
        wF = total - wB;
        if (wF === 0) break;
        
        sumB += t * histogram[t];
        
        let mB = sumB / wB;
        let mF = (sum - sumB) / wF;
        
        let varBetween = wB * wF * (mB - mF) * (mB - mF);
        
        if (varBetween > varMax) {
          varMax = varBetween;
          threshold = t;
        }
      }
      
      // Aplicar binarização e melhorias
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        const binary = gray > threshold ? 255 : 0;
        
        data[i] = binary;     // R
        data[i + 1] = binary; // G
        data[i + 2] = binary; // B
        // Alpha permanece o mesmo
      }
      
      // Aplicar filtro de ruído (mediana simples)
      const smoothedData = new Uint8ClampedArray(data);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          const neighbors = [];
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = ((y + dy) * width + (x + dx)) * 4;
              neighbors.push(data[nIdx]);
            }
          }
          
          neighbors.sort((a, b) => a - b);
          const median = neighbors[4]; // Mediana de 9 valores
          
          smoothedData[idx] = median;
          smoothedData[idx + 1] = median;
          smoothedData[idx + 2] = median;
        }
      }
      
      // Colocar dados processados de volta
      ctx.putImageData(new ImageData(smoothedData, width, height), 0, 0);
      
      // Converter para URL
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};