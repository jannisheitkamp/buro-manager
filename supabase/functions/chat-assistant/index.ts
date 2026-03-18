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
    const { messages, user_id } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Initialize Supabase Client to fetch context data
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // --- FETCH CONTEXT DATA ---
    // Get current date context
    const today = new Date().toISOString().split('T')[0]
    
    // Fetch user profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user_id).single()
    
    // Fetch today's absences
    const { data: absences } = await supabase
        .from('absences')
        .select('*, profiles(full_name)')
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)

    // Fetch open leads count
    const { count: openLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'done')

    // Fetch open callbacks count
    const { count: openCallbacks } = await supabase
        .from('callbacks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')

    // Fetch total production (this month)
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { data: production } = await supabase
        .from('production_entries')
        .select('commission_amount')
        .gte('submission_date', startOfMonth)
    
    const totalCommission = production?.reduce((acc, curr) => acc + (curr.commission_amount || 0), 0) || 0

    // Build System Prompt with Context
    const systemPrompt = `Du bist der "Büro Manager KI-Assistent", eine hochintelligente Assistenz für eine Versicherungsagentur. 
Deine Aufgabe ist es, dem Mitarbeiter (Name: ${profile?.full_name || 'Unbekannt'}) bei Fragen zum Büroalltag, Kunden, Terminen und Umsätzen zu helfen.
Sei professionell, aber locker (du darfst Emojis verwenden). Antworte auf Deutsch.

Hier ist der aktuelle Kontext (Heute ist der ${today}):
- Abwesende Mitarbeiter heute: ${absences?.length ? absences.map(a => `${a.profiles?.full_name} (${a.type})`).join(', ') : 'Niemand, alle sind da.'}
- Offene Leads im System: ${openLeads || 0}
- Offene Rückrufe: ${openCallbacks || 0}
- Umsatz im aktuellen Monat (Gesamtes Team): ${totalCommission.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}

Wenn der Nutzer nach Dingen fragt, die nicht im Kontext stehen (z.B. spezifische Kundennamen, die du nicht siehst), antworte, dass du darauf im Moment keinen direkten Zugriff hast, aber erkläre ihm, wo er es in der App finden kann (z.B. unter "Leads" oder "Produktion").
`

    // Format messages for Gemini API
    // Gemini format: { role: 'user' | 'model', parts: [{ text: '...' }] }
    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === 'assistant' || msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))

    // Add System Prompt as the first user message (workaround for Gemini flash if system_instruction is not supported in this exact endpoint format, but usually we can use systemInstruction)
    
    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      }
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    const result = await response.json()

    if (result.error) {
        throw new Error(result.error.message)
    }

    const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Tut mir leid, ich konnte keine Antwort generieren.'

    return new Response(JSON.stringify({ text: aiText }), {
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
