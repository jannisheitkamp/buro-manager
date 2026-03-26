import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // --- GEMINI API CALL ---
    // You need to set GEMINI_API_KEY in your Supabase project secrets
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }
    const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash'

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Du bist ein Experte für Versicherungsdokumente. Extrahiere aus diesem Dokument die folgenden Daten im JSON-Format: customer_name (Nachname), customer_firstname (Vorname), policy_number (Versicherungsscheinnummer), category (Einer der Werte: life, health, property, car, legal, other), sub_category (Spezifischer Tarifname), net_premium (Netto-Beitrag als Zahl), payment_method (Einer der Werte: monthly, quarterly, half_yearly, yearly, one_time). Wenn ein Wert nicht findbar ist, antworte mit null für dieses Feld. Gib NUR das reine JSON-Objekt zurück." },
            {
              inline_data: {
                mime_type: file.type,
                data: base64
              }
            }
          ]
        }]
      })
    })

    const result = await response.json()
    const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    // Clean JSON from markdown if necessary
    let jsonStr = aiText.replace(/```json|```/g, '').trim()
    
    // Handle empty or invalid response
    if (!jsonStr) {
      return new Response(JSON.stringify({ error: 'Could not extract valid data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    let extractedData = {}
    try {
      extractedData = JSON.parse(jsonStr)
    } catch (e) {
      console.error("Failed to parse JSON:", jsonStr)
      return new Response(JSON.stringify({ error: 'Invalid JSON returned from AI' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
