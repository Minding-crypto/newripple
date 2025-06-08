import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { XummSdk } from 'xumm-sdk';

// Helper to convert a string to a hex string
const toHexString = (str: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}


// Add CORS headers to allow requests from the app
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // This is needed to handle the browser's preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Get the API keys from the Supabase secrets you configured.
    const apiKey = Deno.env.get('XUMM_API_KEY')
    const apiSecret = Deno.env.get('XUMM_API_SECRET')

    if (!apiKey || !apiSecret) {
      console.error('Missing XUMM API Key or Secret in Supabase project secrets.')
      throw new Error('Server is not configured for payments. Missing API credentials.')
    }

    // 2. Initialize the XUMM SDK.
    const sdk = new XummSdk(apiKey, apiSecret)

    // 3. Get the data sent from the app.
    const { 
      loanId, 
      funderId, 
      funderAddress, 
      borrowerAddress, 
      xrpAmount 
    } = await req.json()

    // 4. Check that all required data was received.
    if (!funderAddress || !borrowerAddress || !xrpAmount || !loanId || !funderId) {
        return new Response(JSON.stringify({ error: 'Missing required fields in request body.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400, // Bad Request
        });
    }

    // 5. Create the payment transaction details.
    // The XRPL requires amounts in "drops", where 1 XRP = 1,000,000 drops.
    const amountInDrops = Math.round(xrpAmount * 1_000_000).toString();

    const tx_json = {
        TransactionType: 'Payment',
        Account: funderAddress,
        Destination: borrowerAddress,
        Amount: amountInDrops,
        Memos: [
          {
            Memo: {
              // We add a memo to the transaction so we can identify it later.
              // The MemoType and MemoData fields must be converted to HEX.
              MemoType: toHexString('ripplefund:loan'),
              MemoData: toHexString(JSON.stringify({ loanId, funderId })),
            }
          }
        ]
    }

    // 6. Create the payment payload using the XUMM SDK.
    const payload = await sdk.payload.create({
        txjson: tx_json,
        custom_meta: {
            identifier: `loan_funding_${loanId}_${funderId}`
        }
    })

    console.log('Successfully created XUMM payload:', payload.uuid)

    // 7. Send the successful response back to the app.
    return new Response(JSON.stringify({ success: true, data: payload }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in create-xumm-payment-request function:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // Internal Server Error
    })
  }
}) 