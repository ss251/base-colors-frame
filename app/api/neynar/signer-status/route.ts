import { NextRequest, NextResponse } from 'next/server';

// Define an interface for the signer info response
interface SignerInfo {
  signer_uuid: string;
  public_key: string;
  status: string;
  signer_approval_url?: string;
  fid?: number;
}

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
    
    try {
      // Get the current signer status
      const statusResponse = await fetch(`https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'api_key': NEYNAR_API_KEY
        }
      });
      
      if (!statusResponse.ok) {
        const errorData = await statusResponse.json();
        throw new Error(`Failed to get signer status: ${JSON.stringify(errorData)}`);
      }
      
      const statusData = await statusResponse.json();
      console.log('Signer status check:', statusData);
      
      // Extract the necessary information
      const signerInfo: SignerInfo = {
        signer_uuid: signerUuid,
        public_key: statusData.result?.public_key || '',
        status: statusData.result?.status || 'unknown'
      };

      // If the signer is in "pending_approval" status but we don't have an approval URL,
      // try to get it
      if (statusData.result?.status === 'pending_approval' && 
          !statusData.result?.signer_approval_url && 
          !statusData.signer_approval_url) {
        
        // Try to get the approval URL from a separate API call - for older API versions
        try {
          const approvalResponse = await fetch(`https://api.neynar.com/v1/farcaster/signer/approval?signer_uuid=${signerUuid}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'api_key': NEYNAR_API_KEY
            }
          });
          
          if (approvalResponse.ok) {
            const approvalData = await approvalResponse.json();
            if (approvalData.approval_url) {
              signerInfo.signer_approval_url = approvalData.approval_url;
            }
          }
        } catch (approvalError) {
          console.error('Error getting approval URL:', approvalError);
          // We'll continue even if this fails, as it's an additional attempt
        }
      } else if (statusData.result?.signer_approval_url || statusData.signer_approval_url) {
        // If we already have the approval URL in the status response, use it
        signerInfo.signer_approval_url = statusData.result?.signer_approval_url || statusData.signer_approval_url;
      }
      
      // If the signer is approved and has an FID, include it
      if (statusData.result?.status === 'approved' && statusData.result?.fid) {
        signerInfo.fid = statusData.result.fid;
      }
      
      return NextResponse.json(signerInfo);
      
    } catch (error) {
      console.error('Error checking signer status:', error);
      return NextResponse.json({ 
        error: 'Failed to check signer status', 
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error in signer-status API:', error);
    return NextResponse.json({ 
      error: 'Failed to process request', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 