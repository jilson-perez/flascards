import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [AppController],
  providers: [StorageService],
})
export class AppModule {}
