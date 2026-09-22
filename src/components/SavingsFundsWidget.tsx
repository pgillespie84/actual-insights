"use client";

import { FundSparkline } from "@/components/FundSparkline";
import { formatCents, formatSignedDollars } from "@/lib/format";
import type { FundGroup, FundRow } from "@/lib/savingsFunds";

/**
 * What the household's savings money is earmarked for.
 *
 * A different question from the metric row above it, which answers how the
 * month is going. These figures are typed in by hand on the admin page and
 * feed nothing else on this page — not net worth, not the Savings box, not
 * the AI summary.
 *
 * A figure carried forward from an earlier month says so on its own row.
 * That marker is the widget's most important piece of text: without it a
 * fund nobody has checked since June is indistinguishable from one confirmed
 * this week, and the whole section quietly becomes fiction.
 */

/** `2026-09` as `Sep`, for the carried marker, where the year is usually noise. */
function shortMonth(monthKey: string, viewedMonth: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [year, month] = monthKey.split("-");
  const name = names[Number(month) - 1] ?? monthKey;
  // The year is carried only when it differs from the month being viewed —
  // "as of Dec" on a September dashboard would be nine months old or
  // twenty-one, and the difference matters.
  return year === viewedMonth.slice(0, 4) ? name : `${name} ${year}`;
}

export function SavingsFundsWidget({
  groups,
  monthKey,
  isPrint = false,
}: {
  groups: FundGroup[];
  monthKey: string;
  isPrint?: boolean;
}) {
  if (groups.length === 0) return null;

  const anyFigures = groups.some((group) => group.funds.some((f) => f.balance !== null));

  return (
    <section className="widget-card p-4 sm:p-5">
      <p className="eyebrow">Savings funds</p>

      {!anyFigures ? (
        // Said rather than hidden. A section that disappears for older months
        // reads as a bug in the page; this reads as what it is, a month from
        // before anyone was recording funds.
        <p className="mt-3 text-sm text-text-secondary">
          No fund balances recorded for {monthKey}.
        </p>
      ) : (
        <div
          className={`mt-3 grid gap-x-8 gap-y-6 ${
            groups.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {groups.map((group) => (
            // min-w-0 because a grid item defaults to min-width:auto, which
            // lets its widest row set the column width instead of the column
            // constraining the row — the truncating fund name then never
            // truncates and the card runs off the side of a phone.
            <div key={group.group} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 border-b border-card-border pb-2">
                <h3 className="text-sm font-semibold text-text-primary">{group.group}</h3>
                <p className="text-sm font-semibold tabular-nums text-text-primary">
                  {formatCents(group.total)}
                </p>
              </div>
              <ul className={isPrint ? "mt-2" : "mt-2 space-y-1"}>
                {group.funds
                  .filter((fund) => !fund.dormant)
                  .map((fund) => (
                    <FundLine key={fund.id} fund={fund} monthKey={monthKey} />
                  ))}
              </ul>

              <DormantNote funds={group.funds.filter((fund) => fund.dormant)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The funds left out, named.
 *
 * Named rather than counted, and shown rather than silently dropped: a row
 * quietly disappearing from a financial page is how a group total stops
 * matching what is above it. These hold nothing, so they change no figure —
 * the line exists so the page never hides the existence of a fund, and so a
 * fund set up and never funded is visible as exactly that.
 */
function DormantNote({ funds }: { funds: FundRow[] }) {
  if (funds.length === 0) return null;

  return (
    <p className="mt-2 border-t border-card-border pt-2 text-[11px] leading-snug text-text-muted">
      Empty for months, not listed: {funds.map((fund) => fund.name).join(", ")}
    </p>
  );
}

function FundLine({ fund, monthKey }: { fund: FundRow; monthKey: string }) {
  return (
    <li className="flex items-center gap-3 py-1">
      {/*
        The carried marker sits under the fund name rather than in a column of
        its own. A column costs 56px on every row, which on a phone is the
        difference between "Car Repair Fund" and "Car Repai…" — and the name
        is the one thing on the row that cannot be guessed from the others.
        Under the name it also reads as being about that fund, which is what
        it is.
      */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-text-primary" title={fund.name}>
          {fund.name}
        </span>
        {fund.carried && fund.asOf !== null && (
          <span className="block text-[10px] leading-tight text-text-muted">
            as of {shortMonth(fund.asOf, monthKey)}
          </span>
        )}
      </span>

      {/*
        Hidden below `sm`, where the row has about enough width for a name, a
        figure and a change. The line is the first thing to go because it is
        the only one of the three that carries no number.
      */}
      <span className="hidden sm:block">
        <FundSparkline
          history={fund.history}
          label={`${fund.name}, last 12 months`}
        />
      </span>

      <span className="w-20 text-right text-sm tabular-nums text-text-primary sm:w-24">
        {fund.balance === null ? "—" : formatCents(fund.balance)}
      </span>

      <span
        className={`w-16 text-right text-xs tabular-nums sm:w-20 ${
          fund.change === null
            ? "text-text-muted"
            : fund.change > 0
              ? "text-positive"
              : fund.change < 0
                ? "text-negative"
                : "text-text-secondary"
        }`}
      >
        {/*
          An em dash, not +$0, when there is nothing to compare against. A
          fund recorded for the first time this month has not held steady.
        */}
        {fund.change === null ? "—" : formatSignedDollars(fund.change)}
      </span>


    </li>
  );
}
