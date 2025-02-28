import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { createHash } from 'crypto';

/**
 * API route handler for uploading images (SVGs)
 * 
 * @param request - The incoming request with image data
 * @returns JSON response with success status and image URL
 */
interface RequestBody {
  data: string; // SVG data as a string
}

/**
 * Handles POST requests for uploading SVG images
 * Uploads them to Vercel Blob storage with a hash-based filename
 * Returns the URL to access the uploaded image
 */
export async function POST(request: NextRequest) {
  try {
    // Extract data from request
    const body = await request.json() as RequestBody;
    const svgData = formatSvgData(body.data);
    
    try {
      // Create a unique filename based on content hash
      const hash = createHash('md5').update(svgData).digest('hex');
      const filename = `${hash}.svg`;
      
      // Convert SVG string to blob
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
      
      // Upload to Vercel Blob storage
      const { url } = await put(filename, svgBlob, {
        access: 'public',
        contentType: 'image/svg+xml',
      });
      
      console.log(`Image uploaded to Vercel Blob: ${url}`);
      
      // Return success with the Blob URL
      return NextResponse.json({ 
        success: true,
        url: url
      });
    } catch (error) {
      console.error('Error uploading image to Vercel Blob:', error);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error processing image upload:', error);
    return NextResponse.json({ error: 'Failed to process image' }, { status: 400 });
  }
}

// Helper function to properly format SVG data
function formatSvgData(data: string): string {
  // If it's a data URL, extract the actual SVG content
  if (data.startsWith('data:image/svg+xml;base64,')) {
    const base64Data = data.replace('data:image/svg+xml;base64,', '');
    return Buffer.from(base64Data, 'base64').toString('utf-8');
  }
  
  if (data.startsWith('data:image/svg+xml,')) {
    return decodeURIComponent(data.replace('data:image/svg+xml,', ''));
  }
  
  // Return as is if it's already raw SVG
  return data;
} 