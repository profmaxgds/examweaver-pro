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
    const { imageData, prompt } = await req.json()
    
    if (!imageData) {
      throw new Error('imageData is required')
    }

    // DeepSeek API configuration
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')
    
    if (!DEEPSEEK_API_KEY) {
      console.log('⚠️ DeepSeek API key not configured, using simulation...')
      
      // Simulação para desenvolvimento
      const simulatedText = await simulateDeepSeekOCR(imageData)
      return new Response(
        JSON.stringify({ 
          extractedText: simulatedText,
          confidence: 0.88,
          engine: 'deepseek-simulated'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Preparar request para DeepSeek API
    const deepseekRequest = {
      model: "deepseek-vl-7b-chat", // Modelo de visão do DeepSeek
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt || "Extract all handwritten text from this image. Return only the text content, maintaining line breaks and structure."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageData}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.1 // Baixa temperatura para maior precisão
    }

    // Chamar DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(deepseekRequest)
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`)
    }

    const result = await response.json()
    
    let extractedText = ''
    let confidence = 0.8
    
    if (result.choices && result.choices[0] && result.choices[0].message) {
      extractedText = result.choices[0].message.content.trim()
      
      // Estimar confiança baseada na resposta
      if (extractedText.length > 10) {
        confidence = 0.9
      } else if (extractedText.length > 5) {
        confidence = 0.7
      } else {
        confidence = 0.5
      }
    }

    return new Response(
      JSON.stringify({ 
        extractedText: extractedText || 'Nenhum texto detectado',
        confidence,
        engine: 'deepseek',
        usage: result.usage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('DeepSeek OCR error:', error)
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
async function simulateDeepSeekOCR(imageData: string): Promise<string> {
  // Simular delay de processamento
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const simulatedTexts = [
    "Resposta manuscrita analisada pela IA DeepSeek:\n\nA questão pede para explicar o conceito de testes unitários. Em minha opinião, testes unitários são fundamentais para garantir a qualidade do código, pois permitem verificar se cada função trabalha conforme esperado.",
    "Texto extraído pelo DeepSeek:\n\nPara resolver este problema, primeiro devemos analisar os dados fornecidos. A solução envolve aplicar o algoritmo correto e verificar os resultados obtidos.",
    "Manuscrito detectado:\n\nA resposta é: O desenvolvimento de software requer planejamento cuidadoso e implementação gradual. Cada etapa deve ser testada antes de prosseguir para a próxima fase.",
    "Análise DeepSeek da escrita:\n\nEste exercício demonstra a importância de compreender os requisitos antes de começar a codificar. A documentação adequada também é essencial para manter o projeto.",
    "Texto manuscrito identificado:\n\nConclusão: A metodologia ágil oferece flexibilidade no desenvolvimento, permitindo adaptações rápidas às mudanças de requisitos do cliente."
  ]
  
  const randomText = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)]
  console.log('🤖 DeepSeek OCR simulado:', randomText)
  
  return randomText
}