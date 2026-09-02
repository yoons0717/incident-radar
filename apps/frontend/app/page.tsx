import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TopBar } from "@/components/dashboard/top-bar";
import { TrendChart } from "@/components/dashboard/trend-chart";

export default function Page() {
  return (
    <main className="mx-auto max-w-[1180px] px-[22px] pb-[60px] pt-[22px]">
      <TopBar />
      <StatTiles />
      <TrendChart />
    </main>
  );
}
