import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/**
 * 트래픽 시뮬레이터. 가짜 서비스들이 에러를 보고하는 것처럼 POST /errors 를 반복한다.
 *
 *   pnpm --filter @incident-radar/tools sim -- --duration 10s
 *   pnpm --filter @incident-radar/tools sim -- --spike checkout
 *
 * 순수 함수(expInterval/parseDuration/parseSimArgs/pickService)만 export 하고,
 * 이 파일을 직접 실행할 때만 run() 이 돈다 (아래 main guard).
 */

export interface SimConfig {
  url: string;
  /** 평상시 트래픽 속도 (초당 요청 수) */
  rate: number;
  durationMs: number;
  /** 지정 시 시작하자마자 이 서비스로 임계값 초과 버스트를 쏜다 */
  spike: string | null;
}

/** 가짜 서비스와 상대 트래픽 비중 */
const SERVICES = [
  { name: "checkout", weight: 3 },
  { name: "auth", weight: 2 },
  { name: "search", weight: 1 },
  { name: "payments", weight: 1 },
] as const;
const TOTAL_WEIGHT = SERVICES.reduce((s, x) => s + x.weight, 0);

// ponytail: 백엔드 기본 ALERT_THRESHOLD=10 을 넘기려는 값. 임계값을 바꿨으면 여기도.
const SPIKE_BURST = 15;

/**
 * 다음 요청까지 대기시간(초). 지수분포 = -ln(1-U)/λ.
 * 평균은 1/rate 지만 간격이 불규칙해 실제 포아송 트래픽을 흉내낸다.
 */
export function expInterval(ratePerSec: number, rng: () => number = Math.random): number {
  return -Math.log(1 - rng()) / ratePerSec;
}

/** "10s" → 10000, "2m" → 120000, "5" → 5000 (접미사 없으면 초). 그 외엔 throw. */
export function parseDuration(s: string): number {
  const m = /^(\d+(?:\.\d+)?)(s|m)?$/.exec(s.trim());
  if (!m) throw new Error(`duration 형식이 잘못됨: ${s} (예: 10s, 2m, 30)`);
  const n = Number(m[1]);
  return m[2] === "m" ? n * 60_000 : n * 1_000;
}

export function parseSimArgs(argv: string[]): SimConfig {
  // `pnpm --filter x sim -- --flag` 는 선행 `--` 를 그대로 넘긴다. 있으면 버린다.
  if (argv[0] === "--") argv = argv.slice(1);
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: "string", default: "http://localhost:3000" },
      rate: { type: "string", default: "2" },
      duration: { type: "string", default: "10s" },
      spike: { type: "string" },
    },
  });
  const rate = Number(values.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`rate 는 양수여야 함: ${values.rate}`);
  }
  return {
    url: values.url,
    rate,
    durationMs: parseDuration(values.duration),
    spike: values.spike ?? null,
  };
}

/** weight 비례 가중 랜덤으로 서비스 하나 고르기 */
export function pickService(rng: () => number = Math.random): string {
  let r = rng() * TOTAL_WEIGHT;
  for (const s of SERVICES) {
    if (r < s.weight) return s.name;
    r -= s.weight;
  }
  return SERVICES[SERVICES.length - 1]!.name;
}

async function postError(url: string, service: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/errors`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // T20 레이트리밋 우회용. 지금은 서버가 무시.
        "x-load-test": "1",
      },
      body: JSON.stringify({ service, message: `simulated error @ ${new Date().toISOString()}` }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function run(cfg: SimConfig): Promise<void> {
  const sent = new Map<string, number>();
  let failed = 0;
  const bump = (svc: string, ok: boolean) => {
    sent.set(svc, (sent.get(svc) ?? 0) + 1);
    if (!ok) failed++;
  };

  const started = Date.now();
  const summary = () => {
    const total = [...sent.values()].reduce((a, b) => a + b, 0);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const breakdown = [...sent.entries()].map(([s, n]) => `${s} ${n}`).join(", ");
    console.log(`\nsent ${total} requests over ${elapsed}s (${breakdown}) — ${failed} failed`);
  };
  process.on("SIGINT", () => {
    summary();
    process.exit(0);
  });

  if (cfg.spike) {
    console.log(`spike: ${cfg.spike} 에 ${SPIKE_BURST}연발`);
    for (let i = 0; i < SPIKE_BURST; i++) {
      bump(cfg.spike, await postError(cfg.url, cfg.spike));
    }
  }

  while (Date.now() - started < cfg.durationMs) {
    const svc = pickService();
    bump(svc, await postError(cfg.url, svc));
    await sleep(expInterval(cfg.rate) * 1000);
  }
  summary();
}

// main guard — 직접 실행할 때만. import(테스트) 시엔 순수 함수만 노출.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(parseSimArgs(process.argv.slice(2))).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
