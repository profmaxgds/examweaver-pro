import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageData, features = ['TEXT_DETECTION'] } = await req.json()
    
    if (!imageData) {
      throw new Error('imageData is required')
    }

    // Google Cloud Vision API endpoint
    const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY')
    
    if (!GOOGLE_VISION_API_KEY) {
      console.log('⚠️ Google Vision API key not configured, using simulation...')
      
      // Simulação para desenvolvimento
      const simulatedText = await simulateGoogleVisionOCR(imageData)
      return new Response(
        JSON.stringify({ 
          extractedText: simulatedText,
          confidence: 0.85,
          engine: 'google-vision-simulated'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Preparar request para Google Vision API
    const visionRequest = {
      requests: [
        {
          image: {
            content: imageData
          },
          features: features.map(feature => ({
            type: feature,
            maxResults: 10
          }))
        }
      ]
    }

    // Chamar Google Vision API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(visionRequest)
      }
    )

    if (!response.ok) {
      throw new Error(`Google Vision API error: ${response.status}`)
    }

    const result = await response.json()
    
    // Extrair texto das respostas
    let extractedText = ''
    let confidence = 0
    
    if (result.responses && result.responses[0]) {
      const annotations = result.responses[0]
      
      // Preferir fullTextAnnotation se disponível
      if (annotations.fullTextAnnotation) {
        extractedText = annotations.fullTextAnnotation.text
        confidence = 0.9 // Google Vision geralmente tem alta confiança
      }
      // Fallback para textAnnotations
      else if (annotations.textAnnotations && annotations.textAnnotations.length > 0) {
        extractedText = annotations.textAnnotations[0].description
        confidence = 0.85
      }
    }

    return new Response(
      JSON.stringify({ 
        extractedText: extractedText || 'Nenhum texto detectado',
        confidence,
        engine: 'google-vision',
        rawResponse: result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Google Vision OCR error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        extractedText: 'Erro na extração de texto'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Simulação para desenvolvimento
async function simulateGoogleVisionOCR(imageData: string): Promise<string> {
  // Simular delay de processamento
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  const simulatedTexts = [
    "Esta é uma resposta manuscrita simulada extraída pelo Google Vision OCR.",
    "Texto de exemplo: A resposta correta é que o teste deve verificar funcionalidades.",
    "Resposta do aluno: Acredito que a implementação deve seguir boas práticas de desenvolvimento.",
    "Manuscrito detectado: O algoritmo funciona através de análise de imagem avançada.",
    "Texto extraído: A solução proposta resolve o problema de forma eficiente."
  ]
  
  const randomText = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)]
  console.log('📝 Google Vision OCR simulado:', randomText)
  
  return randomText
}