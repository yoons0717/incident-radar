// 측정 원본 폴더(기본 tools/bench/out/)를 요약한다: 시나리오별 표(markdown) + ③ 초 단위 타임라인(<폴더>/timeline.json).
// 사용: node tools/bench/summarize.mjs [폴더]
// 실패 = non-2xx 응답 + 클라이언트 에러(10초 타임아웃 포함). 지연은 중앙값 RPS 회차의 값.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = process.argv[2] ? pathToFileURL(process.argv[2].replace(/\/?$/, "/")) : new URL("./out/", import.meta.url);
const read = (f) => readFileSync(new URL(f, OUT), "utf8");
const has = (f) => existsSync(new URL(f, OUT));
const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);

function runs(scenario) {
  const list = [];
  for (let i = 1; has(`${scenario}-${i}.json`); i++) {
    const r = JSON.parse(read(`${scenario}-${i}.json`));
    // 컨테이너 로그에 ingest 가 없으면 부하가 다른 프로세스(예: 호스트의 pnpm dev)로 간 것이다.
    if (!read(`${scenario}-${i}.log`).includes("ingest path=")) {
      throw new Error(`${scenario}-${i}: 백엔드 컨테이너 로그에 ingest 가 없음 — 포트 3000 을 다른 프로세스가 쓰고 있는지 확인`);
    }
    const alerts = read(`${scenario}-${i}.alerts`).split("\n").filter(Boolean).map(Number);
    list.push({ i, rps: r.requests.average, lat: r.latency, fail: r.non2xx + r.errors, alerts });
  }
  return list;
}

/** pino JSON 로그 → 초 단위 [t, redis 경로, db 경로, 5xx, 그 초의 최대 응답시간]. t 는 kill 시각 기준(요청이 끝난 시각). */
function timeline(name) {
  const kill = Number(read(`${name}.kill`));
  const restart = Number(read(`${name}.restart`));
  const sec = new Map();
  const at = (time) => {
    const t = Math.floor((time - kill) / 1000);
    if (!sec.has(t)) sec.set(t, [t, 0, 0, 0, 0]);
    return sec.get(t);
  };
  for (const line of read(`${name}.log`).split("\n")) {
    if (!line.startsWith("{")) continue;
    const e = JSON.parse(line);
    const m = /ingest path=(redis|db-fallback)/.exec(e.msg ?? "");
    if (m) at(e.time)[m[1] === "redis" ? 1 : 2]++;
    if (e.req?.url === "/errors" && e.res) {
      const row = at(e.time);
      if (e.res.statusCode >= 500) row[3]++;
      row[4] = Math.max(row[4], e.responseTime ?? 0);
    }
  }
  const alerts = read(`${name}.alerts`).split("\n").filter(Boolean)
    .map((ms) => Math.floor((Number(ms) - kill) / 1000));
  return { restart: Math.round((restart - kill) / 1000), alerts, s: [...sec.values()].sort((a, b) => a[0] - b[0]) };
}

const label = { normal: "① 정상", down: "② Redis 다운", kill: "③ 부하 중 kill" };
console.log("| 시나리오 | RPS (회차별) | 중앙값 RPS | p50 | p99 | max | 실패 (회차별) | 알림 (회차별) |");
console.log("|---|---|---|---|---|---|---|---|");
const timelines = {};
for (const s of ["normal", "down", "kill"]) {
  const rs = runs(s);
  if (!rs.length) continue;
  const med = [...rs].sort((a, b) => a.rps - b.rps)[Math.floor(rs.length / 2)];
  console.log(
    `| ${label[s]} | ${rs.map((r) => Math.round(r.rps)).join(" / ")} | **${Math.round(med.rps)}** | ` +
      `${fmt(med.lat.p50)} | ${fmt(med.lat.p99)} | ${fmt(med.lat.max)} | ` +
      `${rs.map((r) => r.fail).join(" / ")} | ${rs.map((r) => r.alerts.length).join(" / ")} |`,
  );
  if (s === "kill") for (const r of rs) timelines[r.i] = timeline(`kill-${r.i}`);
}
writeFileSync(new URL("timeline.json", OUT), JSON.stringify(timelines));
console.log(`\n③ 타임라인 → ${new URL("timeline.json", OUT).pathname}`);
