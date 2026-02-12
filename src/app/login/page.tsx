"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password required");
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      router.push("/");
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6">
      {/* Logo area */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A04B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11a9 9 0 0 1 9 9" />
            <path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" />
          </svg>
        </div>
        <h1 className="font-serif text-[28px]">The Feed</h1>
        <p className="text-feed-dim text-[13px] tracking-wide mt-1 italic">
          Your content. Your feed.
        </p>
      </div>

      {/* Auth form */}
      <form onSubmit={handleSubmit} className="w-full max-w-[360px] flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          autoFocus
          disabled={loading}
          className="input-glass w-full rounded-2.5xl px-5 py-4 text-[15px] text-feed-text placeholder:text-feed-dim disabled:opacity-40"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          disabled={loading}
          className="input-glass w-full rounded-2.5xl px-5 py-4 text-[15px] text-feed-text placeholder:text-feed-dim disabled:opacity-40"
        />

        {error && (
          <p className="text-red-400/90 text-[13px] text-center tracking-wide">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full bg-feed-accent/90 hover:bg-feed-accent text-white py-4 rounded-2.5xl text-[13px] font-semibold tracking-wide transition-all active:scale-[0.96] disabled:opacity-20 disabled:active:scale-100 shadow-[0_0_20px_rgba(212,160,75,0.15)] mt-1"
        >
          {loading ? (
            <span className="animate-pulse tracking-wide">
              {mode === "signup" ? "Creating account..." : "Signing in..."}
            </span>
          ) : (
            mode === "signup" ? "Create account" : "Sign in"
          )}
        </button>
      </form>

      {/* Toggle mode */}
      <button
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
        className="mt-6 text-[13px] text-feed-muted tracking-wide"
      >
        {mode === "login" ? (
          <>Don&apos;t have an account? <span className="text-feed-accent font-medium">Sign up</span></>
        ) : (
          <>Already have an account? <span className="text-feed-accent font-medium">Sign in</span></>
        )}
      </button>
    </div>
  );
}
