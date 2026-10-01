#!/usr/bin/env bash
# Redis 장애 시나리오 부하 측정. 로컬 docker compose 풀스택(production 빌드) 기준, 전후 비교용.
#   ① normal: Redis 정상   ② down: Redis 를 죽이고 7초 뒤 부하
#   ③ kill: 부하 시작 약 8초 지점에 kill(스크립트 기준 10초, npx 기동 시간 포함), 10초 뒤 start
# 시나리오당 3회(+ 맨 앞 워밍업 1회, 기록 안 함). 결과 원본은 tools/bench/out/ (커밋 안 함).
# 요약: node tools/bench/summarize.mjs [출력 폴더]   (출력 폴더는 OUT 환경변수로 바꿀 수 있다)
set -euo pipefail

cd "$(dirname "$0")/../.."
OUT=${OUT:-tools/bench/out}
DC=(docker compose -f docker-compose.yml -f tools/bench/bench.override.yml)
RUNS=${RUNS:-3}
now_ms() { node -e 'console.log(Date.now())'; }

rm -rf "$OUT" && mkdir -p "$OUT"
trap '"${DC[@]}" start redis >/dev/null 2>&1' EXIT # 중간에 멈춰도 Redis 를 죽은 채로 두지 않는다
"${DC[@]}" up -d --build --wait postgres redis backend
until curl -sf localhost:3000/health >/dev/null; do sleep 1; done
KEY=$("${DC[@]}" exec -T backend pnpm --silent seed:api-key bench | tail -1)

reset() {
  "${DC[@]}" start redis >/dev/null
  "${DC[@]}" exec -T redis redis-cli FLUSHALL >/dev/null
  "${DC[@]}" exec -T postgres psql -U ir -d incident_radar -qc "TRUNCATE error_logs, alerts, alert_failures"
  # 백엔드 재시작: 메모리 cooldown 이 이전 회차에서 넘어오지 않게
  "${DC[@]}" restart backend >/dev/null
  until curl -sf localhost:3000/health | grep -q '"ok"'; do sleep 1; done
}

load() {
  npx -y autocannon@8 -c 50 -d 30 -m POST -j \
    -H content-type=application/json -H "authorization=Bearer $KEY" \
    -b '{"service":"checkout","message":"bench"}' http://localhost:3000/errors
}

run() { # $1=시나리오 $2=회차 (0 = 워밍업)
  local name="$1-$2" since killer=
  reset
  since=$(date +%s)
  if [ "$1" = down ]; then
    "${DC[@]}" kill redis >/dev/null
    sleep 7
  fi
  if [ "$1" = kill ]; then
    (sleep 10; now_ms >"$OUT/$name.kill"; "${DC[@]}" kill redis >/dev/null
     sleep 10; now_ms >"$OUT/$name.restart"; "${DC[@]}" start redis >/dev/null) &
    killer=$!
  fi
  load >"$OUT/$name.json" 2>/dev/null
  if [ -n "$killer" ]; then wait "$killer"; fi # kill/start 실패를 set -e 로 전파
  sleep 2 # 늦게 끝난 요청·알림 로그가 찍힐 시간
  "${DC[@]}" logs backend --since "$since" --no-log-prefix >"$OUT/$name.log"
  "${DC[@]}" exec -T postgres psql -U ir -d incident_radar -tAc \
    "SELECT (extract(epoch FROM at) * 1000)::bigint FROM alerts ORDER BY 1" >"$OUT/$name.alerts"
  echo "done: $name"
}

run normal 0; rm "$OUT"/normal-0.*
for s in normal down kill; do
  for i in $(seq 1 "$RUNS"); do run "$s" "$i"; done
done
