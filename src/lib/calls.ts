import { supabase } from '@/lib/supabase';

// This is a client-side function for demonstration. 
// In a real scenario, this would be an Edge Function (server-side) to protect the database.
// But for now, we can simulate the "Reception" logic or create a UI to view them.

export const fetchCalls = async () => {
  const { data, error } = await supabase
    .from('phone_calls')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

// Simulate an incoming webhook (for testing purposes)
export const simulateIncomingCall = async (callData: {
  caller_number: string;
  status: 'missed' | 'answered';
  duration?: number;
}) => {
  const { error } = await supabase.from('phone_calls').insert([
    {
      caller_number: callData.caller_number,
      direction: 'inbound',
      status: callData.status,
      duration: callData.duration || 0,
      created_at: new Date().toISOString()
    }
  ]);
  
  if (error) console.error('Error simulating call:', error);
};