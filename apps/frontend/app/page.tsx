import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/config";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-xl font-semibold">Incident Radar</h1>
      <p className="mt-1 text-sm text-neutral-500">
        개요 대시보드는 Phase 8에서 붙는다. 지금은 스캐폴드 확인용.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>스캐폴드 상태</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-600">
          API_URL: <code className="rounded bg-neutral-100 px-1.5 py-0.5">{API_URL}</code>
        </CardContent>
      </Card>
    </main>
  );
}
