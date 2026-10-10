import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Param, Post, Put, UnauthorizedException } from '@nestjs/common';
import { StorageService } from './storage.service';

type RegisterBody = {
  name?: string;
  lastName?: string;
  email?: string;
  password?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
};

type DeckBody = {
  cards?: unknown[];
};

function publicAccount(account: any) {
  if (!account) return null;
  const { password, ...rest } = account;
  return rest;
}

@Controller('api')
export class AppController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Get('health')
  health() {
    return { ok: true, redis: this.storage.isRedisEnabled(), framework: 'nestjs' };
  }

  @Post('register')
  async register(@Body() body: RegisterBody) {
    const normalizedEmail = String(body.email || '').trim().toLowerCase();

    if (!body.name || !body.lastName || !normalizedEmail || !body.password) {
      throw new BadRequestException('Missing required account fields.');
    }

    const existing = await this.storage.getAccount(normalizedEmail);
    if (existing) {
      throw new ConflictException('This email already has an account.');
    }

    const account = {
      name: String(body.name).trim(),
      lastName: String(body.lastName).trim(),
      email: normalizedEmail,
      password: String(body.password),
      createdAt: Date.now(),
    };

    await this.storage.saveAccount(account);
    await this.storage.saveDeck(normalizedEmail, []);

    return { account: publicAccount(account) };
  }

  @Post('login')
  async login(@Body() body: LoginBody) {
    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    const account = await this.storage.getAccount(normalizedEmail);

    if (!account || account.password !== String(body.password || '')) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return { account: publicAccount(account) };
  }

  @Get('deck/:email')
  async getDeck(@Param('email') email: string) {
    const cards = await this.storage.getDeck(email);
    return { cards };
  }

  @Put('deck/:email')
  async saveDeck(@Param('email') email: string, @Body() body: DeckBody) {
    const cards = Array.isArray(body.cards) ? body.cards : [];
    await this.storage.saveDeck(email, cards);
    return { ok: true };
  }
}
