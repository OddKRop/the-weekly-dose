"use client";

import { useState } from "react";

const features = [
  {
    icon: "🌍",
    title: "Global & Norwegian news",
    description: "The stories that matter — from Oslo to the rest of the world.",
  },
  {
    icon: "🤖",
    title: "AI & Tech",
    description: "What's happening in tech and AI, explained clearly and without hype.",
  },
  {
    icon: "⏱️",
    title: "20 minutes or less",
    description: "Tight, focused, no filler. Just the essentials, every Friday morning.",
  },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        "https://embeds.beehiiv.com/api/v1/publications/019e1ef0-6a34-496f-9fd2-a1516478e545/subscriptions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span className="text-sm font-semibold tracking-widest uppercase text-zinc-400">
          The Weekly Dose
        </span>
        <span className="text-xs text-zinc-600 tracking-wide">Every Friday</span>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-24 text-center max-w-3xl mx-auto w-full">
        {/* Badge */}
        <div className="animate-fade-in mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-400 tracking-wide">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          New episode every Friday morning
        </div>

        {/* Title */}
        <h1 className="animate-fade-in-delay-1 text-5xl sm:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
          Your weekly
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400">
            briefing.
          </span>
        </h1>

        {/* Tagline */}
        <p className="animate-fade-in-delay-2 text-zinc-400 text-lg sm:text-xl max-w-xl mb-4 leading-relaxed">
          Norway, the world, and tech —
          <br className="hidden sm:block" /> in 20 minutes or less.
        </p>

        <p className="animate-fade-in-delay-2 text-zinc-600 text-sm max-w-lg mb-12 leading-relaxed">
          The Weekly Dose is a short podcast covering the most important stories in AI, tech,
          Norwegian and global news. Just the essentials, delivered every Friday morning.
        </p>

        {/* Email signup */}
        <div className="animate-fade-in-delay-3 w-full max-w-md">
          {submitted ? (
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-6 py-4 text-emerald-400 text-sm">
              You&apos;re on the list. See you Friday.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-white text-black px-6 py-3 text-sm font-semibold hover:bg-zinc-200 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {loading ? "Subscribing..." : "Subscribe free"}
              </button>
            </form>
          )}
          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          <p className="mt-3 text-xs text-zinc-700">No spam. Unsubscribe anytime.</p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-900 px-6 py-16 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-3 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/60"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="text-sm font-semibold text-zinc-200">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-6 py-8 text-center text-xs text-zinc-700 max-w-5xl mx-auto w-full">
        © {new Date().getFullYear()} The Weekly Dose
      </footer>
    </main>
  );
}
