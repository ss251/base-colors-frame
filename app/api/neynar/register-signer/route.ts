import { NextRequest, NextResponse } from 'next/server';
import { getSignedKey } from '@/app/utils/getSignedKey';

interface RequestBody {
  signer_uuid: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json() as RequestBody;
    const { signer_uuid } = body;
    
    // Validate the required parameters
    if (!signer_uuid) {
      return NextResponse.json({ 
        error: 'Missing required parameter: signer_uuid'
      }, { status: 400 });
    }
    
    console.log(`Registering signer with UUID: ${signer_uuid}`);
    
    // Use a direct API call to Neynar to register the signer
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ 
        error: 'NEYNAR_API_KEY is not configured'
      }, { status: 500 });
    }

    try {
      // First, get a signed key for the signer
      // This will return an object that already has the necessary registration info
      const signedKey = await getSignedKey();
      console.log('Signed key result:', signedKey);
      
      // Use the signer_uuid from the signedKey result instead of the request
      // This is because getSignedKey() generates a new signer with its own UUID
      return NextResponse.json({
        signer_uuid: signedKey.signer_uuid, // Use this UUID instead of the request one
        status: 'pending_approval',
        public_key: signedKey.public_key || '',
        signer_approval_url: signedKey.signer_approval_url
      });
      
    } catch (error) {
      console.error('Error registering signer:', error);
      return NextResponse.json({ 
        error: 'Failed to register signer with signed key', 
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error in register-signer API:', error);
    return NextResponse.json({ 
      error: 'Failed to process request', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 