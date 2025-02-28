import { NextRequest, NextResponse } from 'next/server';

// Use environment variable for API key
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

/**
 * API route to fetch a user's profile from Neynar
 */
export async function GET(request: NextRequest) {
  try {
    // Get the FID from the query parameters
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get('fid');
    
    // Validate FID
    if (!fid) {
      return NextResponse.json({ error: 'Missing FID parameter' }, { status: 400 });
    }
    
    console.log(`Fetching profile for FID: ${fid}`);
    
    // Call the Neynar API to get the user profile
    const neynarUrl = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`;
    
    const response = await fetch(neynarUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-api-key': NEYNAR_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status} ${response.statusText}`);
    }
    
    const responseData = await response.json();
    console.log('Neynar user response:', responseData);
    
    // Extract the user information
    const user = responseData.users && responseData.users.length > 0 
      ? responseData.users[0] 
      : null;
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Return the user profile
    return NextResponse.json({ 
      user: {
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ 
      error: 'Server error', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 