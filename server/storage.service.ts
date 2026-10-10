import { Injectable } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import fs from 'node:fs/promises';
import path from 'node:path';

type Account = {
  name: string;
  lastName: string;
  email: string;
  password: string;
  createdAt: number;
};

type FallbackDb = {
  accounts: Record<string, Account>;
  decks: Record<string, unknown[]>;
};

@Injectable()
export class StorageService {
  private readonly dataDir = path.resolve('server-data');
  private readonly dataFile = path.join(this.dataDir, 'fallback-db.json');
  private readonly redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
      : null;

  isRedisEnabled() {
    return Boolean(this.redis);
  }

  async getAccount(email: string) {
    const normalized = email.toLowerCase();
    if (this.redis) return this.redis.hget<Account>('flashcards:accounts', normalized);

    const db = await this.readFallbackDb();
    return db.accounts[normalized] || null;
  }

  async saveAccount(account: Account) {
    const normalized = account.email.toLowerCase();
    if (this.redis) {
      await this.redis.hset('flashcards:accounts', { [normalized]: account });
      return;
    }

    const db = await this.readFallbackDb();
    db.accounts[normalized] = account;
    await this.writeFallbackDb(db);
  }

  async getDeck(email: string) {
    const normalized = email.toLowerCase();
    if (this.redis) return (await this.redis.get<unknown[]>(`flashcards:deck:${normalized}`)) || [];

    const db = await this.readFallbackDb();
    return db.decks[normalized] || [];
  }

  async saveDeck(email: string, cards: unknown[]) {
    const normalized = email.toLowerCase();
    if (this.redis) {
      await this.redis.set(`flashcards:deck:${normalized}`, cards);
      return;
    }

    const db = await this.readFallbackDb();
    db.decks[normalized] = cards;
    await this.writeFallbackDb(db);
  }

  private async readFallbackDb(): Promise<FallbackDb> {
    try {
      const raw = await fs.readFile(this.dataFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { accounts: {}, decks: {} };
    }
  }

  private async writeFallbackDb(db: FallbackDb) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.dataFile, JSON.stringify(db, null, 2));
  }
}
