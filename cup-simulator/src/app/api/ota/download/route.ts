import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
const limit = 10 * 1024 * 1024;
export async function POST(request: NextRequest) {
  try {
    const expectedOrigin = process.env.OTA_SIMULATOR_ORIGIN || request.nextUrl.origin;
    if (request.headers.get('origin') !== expectedOrigin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    }
    const { url } = await request.json() as { url?: unknown };
    if (typeof url !== 'string' || url.length > 4096) throw new Error('Invalid download URL.');
    const target = new URL(url);
    const allowed = (process.env.OTA_DOWNLOAD_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!allowed.includes(target.origin) || target.username || target.password ||
        !/^\/api\/v1\/firmware-download\/[a-f0-9]{32}$/.test(target.pathname) ||
        !target.searchParams.has('signature') || !target.searchParams.has('expires')) {
      return Response.json({ error: 'Only configured, signed application firmware downloads are allowed.' }, { status: 403 });
    }
    // Server-side bridge avoids mixed-content and CORS restrictions for HTTP-only devices.
    // Redirects, arbitrary hosts and oversized responses are deliberately rejected.
    const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Firmware server returned ${response.status}.`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('Firmware exceeds 10 MB.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Firmware response has no body.');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length;
        if (size > limit) { await reader.cancel(); throw new Error('Firmware exceeds 10 MB.'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const output = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return new Response(output, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Download failed.' }, { status: 400 });
  }
}
