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

  if (existsSync(distPath)) {
    app.useStaticAssets(distPath);
    app.getHttpAdapter().getInstance().get(/^\/(?!api).*/, (_request, response) => {
      response.sendFile(join(distPath, 'index.html'));
    });
  }

  await app.listen(port, host);

  const storage = app.get(StorageService);
  console.log(`FlashCards NestJS app listening on http://${host}:${port}`);
  console.log(storage.isRedisEnabled() ? 'Redis storage enabled.' : 'Redis env vars missing. Using local fallback JSON.');
}

bootstrap();
