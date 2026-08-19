/**
 * The metric row: three equal boxes, side by side at every width.
 *
 * They do not stack on a phone. Three short numbers read fine at that width,
 * and stacking them would push the spending chart below a screen of header.
 * Only the gap changes for print.
 */
export function banRowGridClass(isPrint: boolean): string {
  return `grid grid-cols-3 ${isPrint ? "gap-3" : "gap-4"}`;
}

export function bottomRowGridClass(isPrint: boolean, hasSpotlights: boolean): string {
  const gap = isPrint ? "gap-4" : "gap-6";
  const cols = isPrint
    ? hasSpotlights ? "grid-cols-3" : "grid-cols-2"
    : hasSpotlights ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 lg:grid-cols-2";
  return `grid ${cols} ${gap}`;
}
