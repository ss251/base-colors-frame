import { NextRequest, NextResponse } from 'next/server';

// This route needs to be dynamic because it uses searchParams
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get signer UUID from query params
    const searchParams = request.nextUrl.searchParams;
    const signerUuid = searchParams.get('signer_uuid');
    
    if (!signerUuid) {
      return NextResponse.json({ 
        error: 'Missing required parameter: signer_uuid'
      }, { status: 400 });
    }
    
    // Use the Neynar API to check the signer status
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ 
        error: 'NEYNAR_API_KEY is not configured'
      }, { status: 500 });
    }
    
    // First get the raw response for debugging
    const statusResponse = await fetch(`https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api_key': NEYNAR_API_KEY
      }
    });
    
    // Get the raw response body as text
    const rawResponseText = await statusResponse.text();
    
    // Try to parse it as JSON
    let parsedResponse = null;
    try {
      parsedResponse = JSON.parse(rawResponseText);
    } catch (e) {
      console.error('Failed to parse response as JSON');
    }
    
    // Return all the debug information
    return NextResponse.json({
      statusCode: statusResponse.status,
      statusText: statusResponse.statusText,
      headers: Object.fromEntries(statusResponse.headers.entries()),
      rawResponseText,
      parsedResponse,
      signerUuid
    });
    
  } catch (error) {
    console.error('Error in signer-debug API:', error);
    return NextResponse.json({ 
      error: 'Failed to process request', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 