import { NextRequest, NextResponse } from 'next/server';

// This route needs to be dynamic because it uses searchParams
export const dynamic = 'force-dynamic';

// Define an interface for the signer info response
interface SignerInfo {
  signer_uuid: string;
  public_key: string;
  status: string;
  signer_approval_url?: string;
  fid?: number;
  sponsored?: boolean;
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
      console.log(`[DEBUG] Checking signer status for UUID: ${signerUuid}`);
      const statusResponse = await fetch(`https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'api_key': NEYNAR_API_KEY
        },
        // Add cache: 'no-store' to prevent caching
        cache: 'no-store'
      });
      
      if (!statusResponse.ok) {
        const errorData = await statusResponse.json();
        console.error(`[ERROR] Neynar API error: ${JSON.stringify(errorData)}`);
        throw new Error(`Failed to get signer status: ${JSON.stringify(errorData)}`);
      }
      
      const statusData = await statusResponse.json();
      console.log('[DEBUG] Raw Neynar response:', JSON.stringify(statusData));
      
      // Log raw status for debugging
      console.log(`[DEBUG] Raw status value: "${statusData.status}"`);
      if (statusData.result?.status) {
        console.log(`[DEBUG] Raw nested status value: "${statusData.result.status}"`);
      }
      
      // Extract the necessary information - FIXED to correctly access properties
      // Check both top-level and result-nested structures to handle API version differences
      const signerInfo: SignerInfo = {
        signer_uuid: signerUuid,
        public_key: statusData.public_key || statusData.result?.public_key || '',
        status: statusData.status || statusData.result?.status || 'unknown',
        sponsored: statusData.sponsored === true || statusData.result?.sponsored === true
      };

      // If the signer is in "pending_approval" status but we don't have an approval URL,
      // try to get it
      if ((statusData.status === 'pending_approval' || statusData.result?.status === 'pending_approval') && 
          !statusData.signer_approval_url && 
          !statusData.result?.signer_approval_url) {
        
        // Try to get the approval URL from a separate API call - for older API versions
        try {
          console.log('[DEBUG] Attempting to fetch approval URL from v1 API');
          const approvalResponse = await fetch(`https://api.neynar.com/v1/farcaster/signer/approval?signer_uuid=${signerUuid}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'api_key': NEYNAR_API_KEY
            }
          });
          
          if (approvalResponse.ok) {
            const approvalData = await approvalResponse.json();
            console.log('[DEBUG] Approval URL response:', JSON.stringify(approvalData));
            if (approvalData.approval_url) {
              signerInfo.signer_approval_url = approvalData.approval_url;
            }
          } else {
            console.error('[ERROR] Failed to get approval URL:', await approvalResponse.text());
          }
        } catch (approvalError) {
          console.error('[ERROR] Error getting approval URL:', approvalError);
          // We'll continue even if this fails, as it's an additional attempt
        }
      } else if (statusData.signer_approval_url || statusData.result?.signer_approval_url) {
        // If we already have the approval URL in the status response, use it
        signerInfo.signer_approval_url = statusData.signer_approval_url || statusData.result?.signer_approval_url;
      }
      
      // If the signer is approved and has an FID, include it
      if ((statusData.status === 'approved' || statusData.result?.status === 'approved') && 
          (statusData.fid || statusData.result?.fid)) {
        signerInfo.fid = statusData.fid || statusData.result?.fid;
        console.log(`[DEBUG] Signer is APPROVED with FID: ${signerInfo.fid}`);
      }
      
      console.log('[DEBUG] Returning signer info:', JSON.stringify(signerInfo));
      return NextResponse.json(signerInfo);
      
    } catch (error) {
      console.error('[ERROR] Error checking signer status:', error);
      return NextResponse.json({ 
        error: 'Failed to check signer status', 
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('[ERROR] Error in signer-status API:', error);
    return NextResponse.json({ 
      error: 'Failed to process request', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 