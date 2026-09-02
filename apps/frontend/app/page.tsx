import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TopBar } from "@/components/dashboard/top-bar";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <TopBar />
      <StatTiles />
    </main>
  );
}
