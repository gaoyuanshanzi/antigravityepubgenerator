import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Verify it is a Pollinations AI URL to prevent arbitrary SSRF
    try {
      const parsedUrl = new URL(imageUrl);
      if (parsedUrl.hostname !== 'image.pollinations.ai') {
        return NextResponse.json({ error: 'Invalid hostname. Only image.pollinations.ai is allowed.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Image proxy error:', error);
    return NextResponse.json(
      { error: error?.message || 'An error occurred while proxying the image' },
      { status: 500 }
    );
  }
}
