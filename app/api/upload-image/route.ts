import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
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
 * Saves them locally with a hash-based filename
 * Returns the URL to access the uploaded image
 */
export async function POST(request: NextRequest) {
  try {
    // Extract data from request
    const body = await request.json() as RequestBody;
    const data = formatSvgData(body.data);
    
    try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        
        // Create a unique filename based on content hash
        const hash = createHash('md5').update(data).digest('hex');
        const filename = `${hash}.svg`;
        const filePath = path.join(uploadsDir, filename);
        
        // Write file to disk
        await fs.writeFile(filePath, data);
        
        console.log(`Image saved to ${filePath}`);
        
        // Build the URL based on environment
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const imageUrl = `${baseUrl}/uploads/${filename}`;
        
        // Return success with the image URL
        return NextResponse.json({ 
            success: true,
            url: imageUrl
        });
    } catch (error) {
        console.error('Error saving image:', error);
        return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
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