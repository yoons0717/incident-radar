import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertsTable } from "@/components/dashboard/alerts-table";
import { CooldownPanel } from "@/components/dashboard/cooldown-panel";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TopBar } from "@/components/dashboard/top-bar";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { API_URL } from "@/lib/config";

/**
 * 대시보드 진입 전 세션을 실제로 검증한다. 쿠키 유무가 아니라 GET /auth/me 응답으로 판단 —
 * 만료됐거나 로그아웃 후 남은 죽은 쿠키면 여기서 걸러져, 화면이 렌더되기 전에 /login 으로 간다.
 */
async function requireSession(): Promise<void> {
  const cookie = (await cookies()).toString();
  let ok = false;
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: { cookie }, cache: "no-store" });
    ok = res.ok;
  } catch {
    ok = false; // 백엔드 불통 등 — 대시보드를 못 보여주니 로그인 화면으로
  }
  if (!ok) redirect("/login");
}

export default async function Page() {
  await requireSession();

  return (
    <main className="mx-auto max-w-[1180px] px-[22px] pb-[60px] pt-[22px]">
      <TopBar />
      <StatTiles />
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.9fr_1fr]">
        <TrendChart />
        <CooldownPanel />
      </div>
      <AlertsTable />
    </main>
  );
}
