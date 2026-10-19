import type { Request, Response } from 'express';

// Audio proxy only: this handler never accesses account or deck storage.
export async function pronunciationAudio(request: Request, response: Response) {
  const text = typeof request.query.text === 'string' ? request.query.text.trim() : '';
  const locale = request.query.locale;
  if (!text || text.length > 180 || (locale !== 'en-US' && locale !== 'en-GB')) {
    response.status(400).json({ error: 'Provide English text of up to 180 characters and a US or UK locale.' });
    return;
  }

  const url = new URL('https://translate.google.com/translate_tts');
  url.search = new URLSearchParams({ ie: 'UTF-8', client: 'tw-ob', tl: locale, q: text }).toString();
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('audio/')) {
      throw new Error('Speech audio is unavailable');
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) throw new Error('Speech audio is empty');
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.send(audio);
  } catch {
    response.status(502).json({ error: 'Speech audio is temporarily unavailable. Please try again.' });
  }
}
