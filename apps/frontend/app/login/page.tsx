"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { login } from "@/lib/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.push("/");
      router.refresh();
    } catch {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[360px] flex-col justify-center px-6">
      <div className="mb-6">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Incident Radar</h1>
        <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-faint">
          대시보드 로그인
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          이메일
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          비밀번호
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-crit">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
