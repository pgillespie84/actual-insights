"use client";

import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { parseInsight, splitFigures } from "@/lib/insightContent";

interface AISummaryCardProps {
  /** Null when no insight exists for the month being viewed. */
  content: string | null;
  createdAt: string | null;
  /** The PDF render, where an expander the reader cannot click is useless. */
  isPrint?: boolean;
}

function Figures({ text }: { text: string }) {
  return (
    <>
      {splitFigures(text).map((segment, i) =>
        segment.isFigure ? (
          <strong key={i} className="font-semibold text-text-primary">
            {segment.text}
          </strong>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((line, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 text-sm leading-relaxed text-text-secondary"
        >
          <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

export function AISummaryCard({ content, createdAt, isPrint = false }: AISummaryCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!content) {
    return (
      <section>
        <p className="eyebrow">Monthly insight</p>
        <p className="mt-2 text-sm text-text-secondary">
          No insight has been generated for this month yet.{" "}
          <Link href="/admin" className="text-accent underline underline-offset-2">
            Generate one
          </Link>
          .
        </p>
      </section>
    );
  }

  const { headline, lookahead, bullets } = parseInsight(content);
  const showBullets = isPrint || expanded || headline === null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Monthly insight</p>
        {createdAt && (
          <span className="text-xs text-text-muted">
            {format(new Date(createdAt), "MMM d, h:mm a")}
          </span>
        )}
      </div>

      {headline && (
        <p className="mt-3 font-serif text-xl leading-relaxed text-text-primary">
          <Figures text={headline} />
        </p>
      )}

      {lookahead && (
        <p className="mt-2 text-sm text-text-secondary">{lookahead}</p>
      )}

      {bullets.length > 0 && (
        <div className="mt-4">
          {showBullets && <Bullets items={bullets} />}

          {/*
            The expander is hidden in print rather than rendered disabled: the
            PDF is the monthly email, where the bullets are the substance and
            there is nothing to click.
          */}
          {!isPrint && headline !== null && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className={`text-xs font-medium text-text-secondary underline underline-offset-4 hover:text-text-primary ${
                expanded ? "mt-4" : ""
              }`}
            >
              {expanded ? "Hide breakdown" : "Full breakdown"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
