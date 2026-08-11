/**
 * Generic deep module for rendering app routes to PDF or PNG via a
 * browserless/chromium container.
 *
 * Phase 2 of PRD #7. Kept intentionally generic so future features
 * (per-widget exports, year-end reports, social cards) can reuse it.
 */

export type RenderOpts = {
  format: "pdf" | "png";
  viewport?: { width: number; height: number };
  clip?: { x: number; y: number; width: number; height: number };
  fullPage?: boolean;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} not configured`);
  }
  return value;
}

export async function renderRoute(path: string, opts: RenderOpts): Promise<Buffer> {
  const browserlessUrl = requireEnv("BROWSERLESS_URL");
  const browserlessToken = requireEnv("BROWSERLESS_TOKEN");
  const renderBaseUrl = requireEnv("PDF_RENDER_BASE_URL");

  // Append the render auth token if configured. The proxy grants it read-only
  // access to the dashboard page and its data routes, nothing more.
  //
  // A query parameter puts the secret into access logs, browser history, and
  // the Referer of any outbound request the rendered page makes. The proxy
  // already accepts the same token in an `x-render-token` header instead; the
  // switch is to drop tokenSuffix below and pass
  //   setExtraHTTPHeaders: { "x-render-token": renderToken }
  // in the browserless request body. Left as-is because that field has to be
  // confirmed against the running browserless container first — if it is
  // rejected or ignored, renders silently produce the login page.
  const renderToken = process.env.PDF_RENDER_AUTH_TOKEN;
  const separator = path.includes("?") ? "&" : "?";
  const tokenSuffix = renderToken ? `${separator}token=${encodeURIComponent(renderToken)}` : "";
  const url = `${renderBaseUrl}${path}${tokenSuffix}`;

  const endpoint =
    opts.format === "pdf"
      ? `${browserlessUrl}/pdf?token=${encodeURIComponent(browserlessToken)}`
      : `${browserlessUrl}/screenshot?token=${encodeURIComponent(browserlessToken)}`;

  const gotoOptions = { waitUntil: "networkidle2" as const, timeout: 30_000 };

  let body: Record<string, unknown>;
  if (opts.format === "pdf") {
    body = {
      url,
      gotoOptions,
      options: {
        format: "letter",
        printBackground: true,
      },
      ...(opts.viewport ? { viewport: opts.viewport } : {}),
    };
  } else {
    body = {
      url,
      gotoOptions,
      options: {
        type: "png",
        ...(opts.clip ? { clip: opts.clip } : {}),
        ...(opts.fullPage !== undefined ? { fullPage: opts.fullPage } : { fullPage: true }),
      },
      ...(opts.viewport ? { viewport: opts.viewport } : {}),
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "<no body>");
    throw new Error(
      `Browserless ${opts.format} render failed: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
