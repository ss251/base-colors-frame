import { NextRequest, NextResponse } from 'next/server';
import { mnemonicToAccount } from "viem/accounts";
import { getFid } from '@/app/utils/getSignedKey';

interface RequestBody {
  signerUuid: string;
  fid: number;
  useSelfSponsorship?: boolean;
}

// Define proper typing for sponsor options
interface NeynarSponsor {
  sponsored_by_neynar: true;
}

interface SelfSponsor {
  sponsored_by_neynar: false;
  signature: string;
  fid: number;
}

type SponsorData = NeynarSponsor | SelfSponsor;

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json() as RequestBody;
    const { signerUuid, fid, useSelfSponsorship = false } = body;
    
    // Validate the required parameters
    if (!signerUuid || !fid) {
      return NextResponse.json({ 
        error: 'Missing required parameters: signerUuid and fid'
      }, { status: 400 });
    }
    
    console.log(`Sponsoring signer with UUID: ${signerUuid} for FID: ${fid}`);
    console.log(`Using self-sponsorship: ${useSelfSponsorship}`);
    
    // Use Neynar API to sponsor the signer
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ 
        error: 'NEYNAR_API_KEY is not configured'
      }, { status: 500 });
    }

    try {
      // Get the signer details to retrieve its public key
      const signerResponse = await fetch(`https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'api_key': NEYNAR_API_KEY
        }
      });
      
      if (!signerResponse.ok) {
        const errorData = await signerResponse.json();
        throw new Error(`Failed to get signer status: ${JSON.stringify(errorData)}`);
      }
      
      const signerData = await signerResponse.json();
      const publicKey = signerData.result?.public_key;
      
      if (!publicKey) {
        throw new Error('Could not retrieve signer public key');
      }

      let sponsorData: SponsorData = {
        sponsored_by_neynar: true
      };
      
      // If using self-sponsorship (app pays directly from warps)
      if (useSelfSponsorship) {
        if (!process.env.FARCASTER_DEVELOPER_MNEMONIC) {
          throw new Error("FARCASTER_DEVELOPER_MNEMONIC is not set");
        }
        
        // Get the app's FID
        const appFid = await getFid();
        
        // Get the account from the mnemonic
        const account = mnemonicToAccount(process.env.FARCASTER_DEVELOPER_MNEMONIC);
        
        // We need to get the current signature for this signer
        const signatureResponse = await fetch(`https://api.neynar.com/v2/farcaster/signer/signature?signer_uuid=${signerUuid}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'api_key': NEYNAR_API_KEY
          }
        });
        
        if (!signatureResponse.ok) {
          const errorData = await signatureResponse.json();
          throw new Error(`Failed to get signer signature: ${JSON.stringify(errorData)}`);
        }
        
        const signatureData = await signatureResponse.json();
        const signature = signatureData.result?.signature;
        
        if (!signature) {
          throw new Error('Could not retrieve signer signature');
        }
        
        // Sign the signature hex as a message
        const sponsorSignature = await account.signMessage({
          message: signature as `0x${string}`,
        });
        
        sponsorData = {
          sponsored_by_neynar: false,
          signature: sponsorSignature,
          fid: appFid,
        };
      }
      
      // Now let's sponsor the signer
      const response = await fetch('https://api.neynar.com/v2/farcaster/signer/sponsor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'api_key': NEYNAR_API_KEY
        },
        body: JSON.stringify({
          signer_uuid: signerUuid,
          sponsor: sponsorData
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to sponsor signer: ${JSON.stringify(errorData)}`);
      }
      
      const result = await response.json();
      
      return NextResponse.json({
        success: true,
        message: `Signer sponsorship successful using ${useSelfSponsorship ? 'self-sponsorship' : 'Neynar sponsorship'}`,
        result
      });
      
    } catch (error) {
      console.error('Error sponsoring signer:', error);
      return NextResponse.json({ 
        error: 'Failed to sponsor signer', 
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error in sponsor-signer API:', error);
    return NextResponse.json({ 
      error: 'Failed to process request', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 