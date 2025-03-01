import { NextRequest, NextResponse } from 'next/server';

interface RequestBody {
  message: string;
  signerUuid: string;
  fid: number;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json() as RequestBody;
    const { message, signerUuid, fid } = body;
    
    // Validate the required parameters
    if (!message || !signerUuid || !fid) {
      return NextResponse.json({ 
        error: 'Missing required parameters'
      }, { status: 400 });
    }
    
    console.log(`Signing message for FID ${fid} with signer ${signerUuid}`);
    
    // Use a direct API call to Neynar to sign the message
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ 
        error: 'NEYNAR_API_KEY is not configured'
      }, { status: 500 });
    }
    
    const response = await fetch('https://api.neynar.com/v2/farcaster/signer/sign-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api_key': NEYNAR_API_KEY
      },
      body: JSON.stringify({
        signer_uuid: signerUuid,
        message: message
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to sign message: ${JSON.stringify(errorData)}`);
    }
    
    const result = await response.json();
    
    // Return the response
    return NextResponse.json({
      signature: result.signature,
      message: message
    });
    
  } catch (error) {
    console.error('Error signing message:', error);
    return NextResponse.json({ 
      error: 'Failed to sign message', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 