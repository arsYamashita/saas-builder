import { NextResponse } from 'next/server';
import { trackAffiliateClick } from '@/lib/affiliate/tracking';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, tenant_id } = body;
    
    if (!code || !tenant_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const sessionId = await trackAffiliateClick(code, tenant_id, req);
    
    return NextResponse.json({
      success: true,
      session_id: sessionId,
    });
  } catch (error) {
    console.error('Affiliate tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track affiliate click' },
      { status: 500 }
    );
  }
}