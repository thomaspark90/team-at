import { list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  const { blobs } = await list({ prefix: 'backgrounds/' });
  return NextResponse.json(blobs);
}

export async function DELETE(req: Request) {
  const { url } = await req.json();
  await del(url);
  return NextResponse.json({ ok: true });
}
