"use client";

import { format } from "date-fns";

interface AISummaryCardProps {
  content: string;
  createdAt: string;
}

export function AISummaryCard({ content, createdAt }: AISummaryCardProps) {
  const lines = content
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-purple-500/20 p-6"
      style={{
        background: "linear-gradient(135deg, rgba(88, 28, 135, 0.15), rgba(15, 23, 42, 0.6))",
        boxShadow: "0 2px 20px rgba(139, 92, 246, 0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Subtle glow accent */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.4), transparent)" }} />

      <div className="relative mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl text-purple-400"
            style={{ background: "rgba(139, 92, 246, 0.15)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-purple-300">AI Insight</h3>
        </div>
        <span className="text-xs text-text-muted">
          {format(new Date(createdAt), "MMM d, h:mm a")}
        </span>
      </div>
      <ul className="relative space-y-2.5">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-400/70" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
