import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { StorageService } from './storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  const port = Number(process.env.PORT || process.env.API_PORT || 8787);
  const host = process.env.HOST || '0.0.0.0';
  const distPath = join(process.cwd(), 'dist');
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.get(/^\/cambridge(\/.*)?$/, async (request, response) => {
    const proxiedPath = request.originalUrl.replace(/^\/cambridge/, '') || '/';
    const targetUrl = `https://dictionary.cambridge.org${proxiedPath}`;

    try {
      const upstream = await fetch(targetUrl, {
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        },
      });
      const contentType = upstream.headers.get('content-type');
      const body = Buffer.from(await upstream.arrayBuffer());

      response.status(upstream.status);
      if (contentType) response.setHeader('content-type', contentType);
      response.send(body);
    } catch {
      response.status(502).send('Cambridge audio service is unavailable.');
    }
  });

  if (existsSync(distPath)) {
    app.useStaticAssets(distPath);
    expressApp.get(/^\/(?!(api|cambridge)(\/|$)).*/, (_request, response) => {
      response.sendFile(join(distPath, 'index.html'));
    });
  }

  await app.listen(port, host);

  const storage = app.get(StorageService);
  console.log(`FlashCards NestJS app listening on http://${host}:${port}`);
  console.log(storage.isRedisEnabled() ? 'Redis storage enabled.' : 'Redis env vars missing. Using local fallback JSON.');
}

bootstrap();
