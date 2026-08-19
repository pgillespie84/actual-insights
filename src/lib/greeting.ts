/**
 * Time-of-day greeting for the dashboard header.
 *
 * The hour is Eastern Time rather than the viewer's, so the PDF render does
 * not inherit whatever clock the browserless container happens to run on and
 * greet the household with the wrong half of the day.
 */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
