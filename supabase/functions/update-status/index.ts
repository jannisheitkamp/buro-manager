
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    const status = url.searchParams.get('status')

    if (!secret || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing secret or status' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Initialize Supabase Client (Service Role for admin access)
    // Try standard env vars first, then fallback to custom ones if needed
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('MY_SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('MY_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseKey)

    // 1. Verify Secret and get User
    const { data: profiles, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, full_name')
      .eq('webhook_secret', secret)
      .limit(1)

    if (profileError || !profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid secret' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const user = profiles[0]

    // 2. Validate Status
    const validStatuses = ['office', 'remote', 'break', 'meeting', 'vacation', 'sick', 'off', 'seminar']
    if (!validStatuses.includes(status)) {
        return new Response(
            JSON.stringify({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
    }

    // 3. Update Status
    // First, check if a status entry exists for today/current logic, or just upsert/update the user_status table
    // The codebase seems to use a single row per user in `user_status` or maybe inserts new ones?
    // Based on previous analysis, `user_status` has `user_id` which suggests one active status or log.
    // Let's assume we update the existing entry or insert if not exists.
    
    // Check if entry exists
    const { data: existingStatus } = await supabaseClient
        .from('user_status')
        .select('id')
        .eq('user_id', user.id)
        .single()

    let error;
    if (existingStatus) {
        const { error: updateError } = await supabaseClient
            .from('user_status')
            .update({ 
                status: status,
                updated_at: new Date().toISOString(),
                message: null // Clear message on status change via shortcut
            })
            .eq('user_id', user.id)
        error = updateError
    } else {
        const { error: insertError } = await supabaseClient
            .from('user_status')
            .insert({
                user_id: user.id,
                status: status,
                updated_at: new Date().toISOString()
            })
        error = insertError
    }

    if (error) throw error

    return new Response(
      JSON.stringify({ 
          success: true, 
          message: `Status updated to ${status}`, 
          user: user.full_name 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
