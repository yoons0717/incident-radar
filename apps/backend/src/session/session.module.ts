import {
  Logger,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisStore } from "connect-redis";
import session from "express-session";
import { createClient, type RedisClientType } from "redis";
import type { Env } from "../config/env.schema";
import "./session.types";

/**
 * express-session + connect-redis 미들웨어를 모든 라우트에 붙인다.
 * connect-redis v10 은 node-redis 클라이언트만 받으므로(ioredis 비호환) 세션 전용
 * 커넥션을 따로 연다 — 앱 캐시 I/O(ioredis)와 세션 I/O 를 분리하는 편이기도 하다.
 */
@Module({})
export class SessionModule implements NestModule, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionModule.name);
  private readonly client: RedisClientType;
  private readonly middleware: ReturnType<typeof session>;

  constructor(config: ConfigService<Env, true>) {
    this.client = createClient({ url: config.get("REDIS_URL", { infer: true }) });
    this.client.on("error", (err: unknown) => this.logger.error(`session redis: ${String(err)}`));

    this.middleware = session({
      store: new RedisStore({ client: this.client, prefix: "sess:" }),
      secret: config.get("SESSION_SECRET", { infer: true }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.get("NODE_ENV", { infer: true }) === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.destroy();
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(this.middleware).forRoutes("*");
  }
}
