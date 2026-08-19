"use client";

import { useState } from "react";

export function EmailDashboardButton({ month }: { month: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleClick() {
    setState("sending");
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      setState("sent");
      setTimeout(() => setState("idle"), 3000);
    } catch (err) {
      console.error("Email send failed:", err);
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === "sending"}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        state === "sent"
          ? "bg-accent-soft text-positive"
          : state === "error"
            ? "bg-warning-bg text-negative"
            : "bg-card-bg text-text-secondary border border-card-border hover:bg-hover-bg hover:text-text-primary"
      } disabled:opacity-50`}
    >
      {state === "sending" && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {state === "idle" && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3z" />
          <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839z" />
        </svg>
      )}
      {state === "sent" && "Sent!"}
      {state === "error" && "Failed to send"}
      {state === "idle" && "Email this page"}
      {state === "sending" && "Sending..."}
    </button>
  );
}
