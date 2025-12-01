import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const mikrotikUrl = 'http://mikrotik-sts.cr-safe.com:50002/rest/interface/wireguard/peers';
    const username = 'admin';
    const password = 'StS2021!!';

    console.log('Fetching MikroTik data...');

    const response = await fetch(mikrotikUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + btoa(`${username}:${password}`),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`MikroTik API responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Successfully fetched ${data.length} peers`);

    return new Response(
      JSON.stringify({ success: true, data }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error fetching from MikroTik:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
