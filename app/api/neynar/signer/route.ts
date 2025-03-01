import { NextResponse, NextRequest } from "next/server";
import neynarClient from "@/lib/neynarClient";

// This route needs to be dynamic because it uses searchParams
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const signer_uuid = searchParams.get("signer_uuid");

    if (!signer_uuid) {
      return NextResponse.json(
        { error: "signer_uuid is required" },
        { status: 400 }
      );
    }

    // Look up the signer
    const signer = await neynarClient.lookupSigner({
      signerUuid: signer_uuid
    });

    return NextResponse.json(signer, { status: 200 });
  } catch (error) {
    console.error("Error fetching signer:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch signer", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 
      { status: 500 }
    );
  }
}

export async function POST() {
  const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
  
  if (!NEYNAR_API_KEY) {
    return NextResponse.json(
      { error: "NEYNAR_API_KEY is not configured" },
      { status: 500 }
    );
  }
  
  try {
    // Create a new signer directly with Neynar's API
    const response = await fetch("https://api.neynar.com/v2/farcaster/signer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "api_key": NEYNAR_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create signer: ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
    
  } catch (error) {
    console.error("Error creating signer:", error);
    return NextResponse.json(
      { 
        error: "Failed to create signer", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 
      { status: 500 }
    );
  }
} 