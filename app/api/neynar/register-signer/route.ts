import { NextRequest, NextResponse } from 'next/server';
import { getSignedKey } from '@/app/utils/getSignedKey';

interface RequestBody {
  signer_uuid: string;
  sponsor?: boolean; // New parameter to indicate if the signer should be sponsored
  useSelfSponsorship?: boolean; // New parameter to specify self-sponsorship
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json() as RequestBody;
    const { signer_uuid, sponsor = true, useSelfSponsorship = false } = body; // Default to sponsoring with Neynar
    
    // Validate the required parameters
    if (!signer_uuid) {
      return NextResponse.json({ 
        error: 'Missing required parameter: signer_uuid'
      }, { status: 400 });
    }
    
    console.log(`Registering signer with UUID: ${signer_uuid}`);
    console.log(`Sponsoring signer: ${sponsor}, Self-sponsorship: ${useSelfSponsorship}`);
    
    // Use a direct API call to Neynar to register the signer
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ 
        error: 'NEYNAR_API_KEY is not configured'
      }, { status: 500 });
    }

    try {
      // First, get a signed key for the signer with sponsorship
      // We pass the sponsor flag and self-sponsorship option to getSignedKey
      const signedKey = await getSignedKey(sponsor, useSelfSponsorship);
      console.log('Signed key result:', signedKey);
      
      // Use the signer_uuid from the signedKey result instead of the request
      // This is because getSignedKey() generates a new signer with its own UUID
      return NextResponse.json({
        signer_uuid: signedKey.signer_uuid, // Use this UUID instead of the request one
        status: 'pending_approval',
        public_key: signedKey.public_key || '',
        signer_approval_url: signedKey.signer_approval_url,
        sponsored: sponsor,
        sponsorshipMethod: useSelfSponsorship ? 'self' : 'neynar'
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