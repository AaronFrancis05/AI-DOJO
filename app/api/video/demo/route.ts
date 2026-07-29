import { NextRequest, NextResponse } from 'next/server';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const filePath = path.join(process.cwd(), 'public', 'demo-video.mp4');

  try {
    await fs.stat(filePath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return new NextResponse('Video not found', { status: 404 });
    }
    throw err;
  }

  const fileSize = (await fs.stat(filePath)).size;
  const rangeHeader = req.headers.get('range');

  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const startStr = match[1];
    const endStr = match[2];
    const start = startStr ? parseInt(startStr, 10) : fileSize - (endStr ? parseInt(endStr, 10) : 0);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || end < start) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const clampedEnd = Math.min(end, fileSize - 1);
    const stream = createReadStream(filePath, { start, end: clampedEnd });

    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
        'Content-Length': String(clampedEnd - start + 1),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
