import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

/** alerts 워커가 보내는 payload 모양 (apps/backend/src/alerts/alerts.types.ts 의 AlertJobData + at) */
interface AlertPayload {
  service: string;
  count: number;
  threshold: number;
  windowMs: number;
  windowStart: number;
  at: string;
}

/**
 * 데모용 어댑터. alerts 워커는 제네릭 JSON(AlertJobData + at)을 아무 WEBHOOK_URL 로 POST 하는데,
 * Discord webhook API 는 body 에 content/embeds 가 있어야 해서 그대로는 400 이 난다.
 * 여기서 받아서 Discord 포맷으로 바꿔 진짜 DISCORD_WEBHOOK_URL 로 포워드한다.
 * 코어(alerts.service.ts)는 이 존재를 모른다 — WEBHOOK_URL 을 이 relay 주소로 두기만 하면 됨.
 *
 *   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... pnpm --filter @incident-radar/tools relay
 */

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";
const PORT = Number(process.env.RELAY_PORT ?? 8787);

/** 60000의 배수면 분 단위로, 아니면 초 단위로 — "윈도우 60초" 같은 raw 설정값 노출 대신 자연스러운 단위. */
function windowLabel(windowMs: number): string {
  return windowMs % 60_000 === 0 ? `${windowMs / 60_000}분` : `${windowMs / 1000}초`;
}

/** https://discord.com/developers/docs/resources/webhook#execute-webhook-jsonform-params */
function toDiscordEmbed(data: AlertPayload) {
  return {
    title: `🚨 ${data.service} 인시던트 알림`,
    description: `최근 ${windowLabel(data.windowMs)} 동안 에러 **${data.count}건** 발생 — 임계값(${data.threshold}건) 초과`,
    color: 0xed4245,
    timestamp: data.at,
    footer: { text: "Incident Radar" },
  };
}

export function createRelayServer(discordWebhookUrl: string) {
  return createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as AlertPayload;
          const discordRes = await fetch(discordWebhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ embeds: [toDiscordEmbed(data)] }),
          });
          console.log(`relay: ${data.service} → discord ${discordRes.status}`);
          res.writeHead(discordRes.ok ? 200 : discordRes.status).end();
        } catch (e) {
          console.error("relay: 처리 실패", e);
          res.writeHead(500).end();
        }
      })();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!DISCORD_WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL 이 필요합니다.");
    process.exit(1);
  }
  createRelayServer(DISCORD_WEBHOOK_URL).listen(PORT, () => {
    console.log(`discord-relay listening on :${PORT} → forwarding to Discord`);
  });
}
