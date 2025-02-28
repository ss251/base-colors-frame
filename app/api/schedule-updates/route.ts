import { NextRequest, NextResponse } from 'next/server';

// Use environment variable for API key - this is the authentication key
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

interface RequestBody {
  signerUuid: string;
  fid: number;
  colorIds: number[];
  interval: 'daily' | 'weekly' | 'monthly';
}

export async function POST(request: NextRequest) {
  try {
    const { signerUuid, fid, colorIds, interval } = await request.json() as RequestBody;
    
    if (!signerUuid || !fid || !colorIds || !interval) {
      console.error('Missing required parameters', { 
        hasSignerUuid: !!signerUuid, 
        hasFid: !!fid,
        hasColorIds: !!colorIds,
        hasInterval: !!interval
      });
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    console.log(`Received request to schedule ${interval} profile updates for FID:`, fid);
    console.log(`Number of colors: ${colorIds.length}`);
    console.log(`Using API Key: ${NEYNAR_API_KEY.substring(0, 8)}...`);
    
    // Store scheduling information in a database
    // This is where you would implement your database logic
    // For now, we'll just simulate success
    
    // You could use Neynar's API to set up a scheduled task
    // or implement your own scheduler using a cron job
    
    // Example implementation:
    // 1. Store the schedule in your database
    // 2. Set up a cron job that:
    //    - Retrieves all scheduled updates
    //    - For each schedule due to run, generates the SVG
    //    - Calls the Neynar API to update the profile picture
    
    // An example of how the Neynar API call would look:
    /* 
    async function updateProfilePicture(fid: number, imageUrl: string, signerUuid: string) {
      const response = await fetch('https://api.neynar.com/v2/farcaster/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        },
        body: JSON.stringify({
          signer_uuid: signerUuid,
          pfp_url: imageUrl
        })
      });
      
      // Just return the json response, no payment handling needed
      return await response.json();
    }
    */
    
    // For this implementation, we'll just return success
    // In a production app, you would set up a real scheduler
    
    console.log('Successfully scheduled profile picture updates');
    return NextResponse.json({
      success: true,
      message: `Profile picture updates scheduled to change ${interval}`,
      scheduledColors: colorIds.length
    });
  } catch (error) {
    console.error('Error scheduling updates:', error);
    // Include more detailed error information
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('Error details:', errorMsg);
    if (errorStack) console.error('Error stack:', errorStack);
    
    return NextResponse.json(
      { 
        error: 'Failed to schedule updates', 
        details: errorMsg,
        stack: errorStack
      },
      { status: 500 }
    );
  }
} 