/**
 * Renders an app route to PDF via a browserless/chromium container.
 *
 * The PNG path and its clip/fullPage options were never called and have been
 * removed; add them back alongside a caller that needs them.
 */

export type RenderOpts = {
  viewport?: { width: number; height: number };
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

  const endpoint = `${browserlessUrl}/pdf?token=${encodeURIComponent(browserlessToken)}`;

  const body = {
    url,
    gotoOptions: { waitUntil: "networkidle2" as const, timeout: 30_000 },
    options: {
      format: "letter",
      printBackground: true,
    },
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "<no body>");
    throw new Error(
      `Browserless PDF render failed: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
