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

    // 프로덕션은 프론트(Vercel)와 백엔드(Railway)가 다른 도메인 → 크로스사이트 쿠키 전송에
    // SameSite=None + Secure 필요. dev/test 는 같은 호스트라 Lax 유지(Secure 는 HTTPS 강제라 못 씀).
    const isProd = config.get("NODE_ENV", { infer: true }) === "production";

    this.middleware = session({
      store: new RedisStore({ client: this.client, prefix: "sess:" }),
      secret: config.get("SESSION_SECRET", { infer: true }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
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
