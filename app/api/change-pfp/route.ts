import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

// Use environment variable for API key - this is the authentication key
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

interface RequestBody {
  fid: number;
  pfp: string; // URL of the profile picture
  signerUuid: string; // Neynar signer UUID
  previousPfp?: string; // Optional previous profile picture URL to delete
}

/**
 * Helper function to delete a blob from Vercel Blob storage
 */
async function deleteOldProfilePicture(url: string) {
  if (!url || !url.includes('blob.vercel-storage.com')) {
    return false; // Not a Vercel Blob URL
  }
  
  try {
    // Extract the pathname from the URL (the blob identifier)
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.substring(1); // Remove leading slash
    
    // Delete the blob
    await del(pathname);
    console.log(`Deleted old profile picture: ${url}`);
    return true;
  } catch (error) {
    console.error('Failed to delete old profile picture:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json() as RequestBody;
    const { fid, pfp, signerUuid, previousPfp } = body;
    
    // Log the request details
    console.log(`Received request to change PFP for FID: ${fid}`);
    console.log(`PFP URL: ${pfp}`);
    console.log(`Signer UUID: ${signerUuid}`);
    console.log(`Using API Key: ${NEYNAR_API_KEY.substring(0, 8)}...`);
    
    // Validate the required parameters
    if (!fid || !pfp || !signerUuid) {
      return NextResponse.json({ 
        error: 'Missing required parameters', 
        details: { fid, pfp: !!pfp, signerUuid: !!signerUuid } 
      }, { status: 400 });
    }
    
    // Call the Neynar API to update the profile picture
    const neynarUrl = 'https://api.neynar.com/v2/farcaster/user';
    
    const response = await fetch(neynarUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': NEYNAR_API_KEY
      },
      body: JSON.stringify({
        signer_uuid: signerUuid,
        pfp_url: pfp
      })
    });
    
    // Parse the response
    const responseData = await response.json();
    
    // Check if the request was successful
    if (!response.ok) {
      console.error('Error updating profile picture:', responseData);
      
      return NextResponse.json({
        error: responseData.error || 'Failed to update profile picture',
        message: responseData.message || 'Unknown error occurred'
      }, { status: response.status });
    }
    
    console.log('Profile picture updated successfully:', responseData);
    
    // Attempt to delete the previous profile picture if provided
    if (previousPfp) {
      await deleteOldProfilePicture(previousPfp);
    }
    
    // Return the response
    return NextResponse.json({
      success: true,
      message: responseData.message || 'Profile picture updated successfully'
    });
    
  } catch (error) {
    console.error('Error in change-pfp API:', error);
    return NextResponse.json({ 
      error: 'Server error', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 