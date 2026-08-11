export function topRowGridClass(isPrint: boolean): string {
  const cols = isPrint ? "grid-cols-3" : "grid-cols-1 lg:grid-cols-3";
  const gap = isPrint ? "gap-4" : "gap-6";
  return `grid ${cols} ${gap}`;
}

export function bottomRowGridClass(isPrint: boolean, hasSpotlights: boolean): string {
  const gap = isPrint ? "gap-4" : "gap-6";
  const cols = isPrint
    ? hasSpotlights ? "grid-cols-3" : "grid-cols-2"
    : hasSpotlights ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 lg:grid-cols-2";
  return `grid ${cols} ${gap}`;
}
