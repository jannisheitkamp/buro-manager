import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://snvdxjpoqfniyhtfqkza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNudmR4anBvcWZuaXlodGZxa3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NTYzNTYsImV4cCI6MjA4MTUzMjM1Nn0.fuGLbLdOrVp4eCAEJziu-GbhvgSHul9-FSriCzd5nzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data, error } = await supabase
    .from('production_entries')
    .select('*')
    .gt('duration', 35);
  
  if (error) {
    console.error(error);
    return;
  }
  
  for (const entry of data) {
    let factor = 12;
    if (entry.payment_method === 'quarterly') factor = 4;
    if (entry.payment_method === 'half_yearly') factor = 2;
    if (entry.payment_method === 'yearly') factor = 1;
    if (entry.payment_method === 'one_time') factor = 1;

    const netYearly = (entry.net_premium || 0) * factor;
    const grossYearly = (entry.gross_premium || 0) * factor;
    
    let valSum = entry.valuation_sum;
    let comm = entry.commission_amount;
    let rate = entry.commission_rate || 0;
    
    const cappedDuration = Math.min(entry.duration, 35);

    if (entry.sub_category === 'Leben' || entry.sub_category === 'BU') {
        valSum = grossYearly * cappedDuration;
        comm = valSum * (rate / 1000);
    } else if (['KV Voll', 'KV Zusatz'].includes(entry.sub_category)) {
        valSum = entry.gross_premium;
        comm = entry.gross_premium * rate;
    } else if (entry.sub_category === 'Reise-KV') {
        valSum = grossYearly;
        comm = grossYearly * (rate / 100);
    } else {
        valSum = netYearly;
        comm = entry.net_premium * (rate / 100);
    }

    let lvFactor = entry.life_value_factor || 0;
    let lv = entry.life_values || 0;

    if (entry.sub_category === 'Leben' || entry.sub_category === 'BU') {
        lvFactor = 1.147;
        lv = valSum * lvFactor;
    } else if (entry.category === 'car') {
        lvFactor = 1;
        lv = netYearly * lvFactor;
    } else if (entry.category === 'property' || entry.category === 'legal' || entry.category === 'other') {
        lvFactor = 20;
        lv = netYearly * lvFactor;
    }

    const { error: updateError } = await supabase
      .from('production_entries')
      .update({
        valuation_sum: valSum,
        commission_amount: comm,
        life_values: lv
      })
      .eq('id', entry.id);

    if (updateError) {
      console.error('Error updating', entry.id, updateError);
    } else {
      console.log('Updated', entry.id, 'with capped duration', cappedDuration);
    }
  }
}

fix();