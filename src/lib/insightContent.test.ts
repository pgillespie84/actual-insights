import { test, expect } from "vitest";
import { parseInsight, splitFigures } from "./insightContent.ts";

const STRUCTURED = `HEADLINE: You saved $1,240 more than last month — your strongest month since March.
LOOKAHEAD: At this pace you'll reach your emergency-fund goal by November.
- Dining is 18% over budget at $612 spent against $520 budgeted.
- Groceries are tracking on pace.`;

test("parseInsight pulls out the headline, the lookahead and the bullets", () => {
  const parsed = parseInsight(STRUCTURED);

  expect(parsed.headline).toBe(
    "You saved $1,240 more than last month — your strongest month since March.",
  );
  expect(parsed.lookahead).toBe(
    "At this pace you'll reach your emergency-fund goal by November.",
  );
  expect(parsed.bullets).toEqual([
    "Dining is 18% over budget at $612 spent against $520 budgeted.",
    "Groceries are tracking on pace.",
  ]);
});

// Every insight already in the database predates the prompt change. They must
// keep rendering rather than coming out blank, so the card can ship before
// anything is regenerated.
test("parseInsight falls back to bullets only when there is no headline", () => {
  const parsed = parseInsight("- First point\n- Second point");

  expect(parsed.headline).toBeNull();
  expect(parsed.lookahead).toBeNull();
  expect(parsed.bullets).toEqual(["First point", "Second point"]);
});

test("parseInsight tolerates a wrapped headline", () => {
  const parsed = parseInsight(
    "HEADLINE: You saved $1,240 more than last month\nand held every category in line.\n- A bullet",
  );

  expect(parsed.headline).toBe(
    "You saved $1,240 more than last month and held every category in line.",
  );
  expect(parsed.bullets).toEqual(["A bullet"]);
});

test("parseInsight ignores case and stray markdown around the labels", () => {
  const parsed = parseInsight("**Headline:** Something happened.\n- A bullet");

  expect(parsed.headline).toBe("Something happened.");
});

test("parseInsight handles a headline with no bullets at all", () => {
  const parsed = parseInsight("HEADLINE: Quiet month.");

  expect(parsed.headline).toBe("Quiet month.");
  expect(parsed.bullets).toEqual([]);
});

test("parseInsight returns everything empty for empty content", () => {
  expect(parseInsight("")).toEqual({
    headline: null,
    lookahead: null,
    bullets: [],
  });
});

test("splitFigures marks dollar amounts and percentages", () => {
  expect(splitFigures("You saved $1,240 and dining is 18% over.")).toEqual([
    { text: "You saved ", isFigure: false },
    { text: "$1,240", isFigure: true },
    { text: " and dining is ", isFigure: false },
    { text: "18%", isFigure: true },
    { text: " over.", isFigure: false },
  ]);
});

test("splitFigures keeps cents and decimals inside the figure", () => {
  expect(splitFigures("Spent $1,234.56 at 12.5% of budget")).toEqual([
    { text: "Spent ", isFigure: false },
    { text: "$1,234.56", isFigure: true },
    { text: " at ", isFigure: false },
    { text: "12.5%", isFigure: true },
    { text: " of budget", isFigure: false },
  ]);
});

test("splitFigures returns one plain segment when there is nothing to mark", () => {
  expect(splitFigures("A quiet month.")).toEqual([
    { text: "A quiet month.", isFigure: false },
  ]);
});

test("splitFigures handles a figure at the very start and end", () => {
  expect(splitFigures("$40 of $60")).toEqual([
    { text: "$40", isFigure: true },
    { text: " of ", isFigure: false },
    { text: "$60", isFigure: true },
  ]);
});
