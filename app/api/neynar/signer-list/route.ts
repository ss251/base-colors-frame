import { NextRequest, NextResponse } from 'next/server';

// Define the Neynar Signer type
interface NeynarSigner {
  object: string;
  signer_uuid: string;
  public_key: string;
  status: string;
  signer_approval_url?: string;
  fid?: number;
  permissions?: string[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const message = searchParams.get('message');
    const signature = searchParams.get('signature');
    
    // Validate the required parameters
    if (!message || !signature) {
      return NextResponse.json(
        { error: 'Missing required parameters: message and signature' },
        { status: 400 }
      );
    }
    
    // Get the API key from environment variables
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      console.error('NEYNAR_API_KEY is not set in the environment variables');
      return NextResponse.json(
        { error: 'API key configuration error' },
        { status: 500 }
      );
    }
    
    console.log(`[PROXY] Forwarding signer list request to Neynar with message length: ${message.length}`);
    
    // Build the URL for the Neynar API call
    const neynarUrl = new URL('https://api.neynar.com/v2/farcaster/signer/list');
    neynarUrl.searchParams.append('message', message);
    neynarUrl.searchParams.append('signature', signature);
    
    // Call the Neynar API
    const response = await fetch(neynarUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-api-key': apiKey,
      },
      cache: 'no-store', // Important: Prevent caching to always get fresh data
    });
    
    // Log the response status
    console.log(`[PROXY] Neynar response status: ${response.status}`);
    
    // Forward the response
    const data = await response.json();
    
    // Add some helpful debug info
    const signerCount = data.signers?.length || 0;
    console.log(`[PROXY] Received ${signerCount} signers from Neynar`);
    
    if (signerCount > 0) {
      // Log a summary of the signers without exposing sensitive data
      const signerSummary = data.signers.map((signer: NeynarSigner) => ({
        status: signer.status,
        has_fid: !!signer.fid,
      }));
      console.log(`[PROXY] Signers summary: ${JSON.stringify(signerSummary)}`);
    }
    
    // Return the response from Neynar
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[PROXY] Error fetching signer list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signer list' },
      { status: 500 }
    );
  }
} 