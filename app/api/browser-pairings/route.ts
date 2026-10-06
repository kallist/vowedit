// Browsers omit Origin on same-origin GET. Verify browser metadata before forwarding it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const allowed = ["http://127.0.0.1:3000", "http://localhost:3000"];
  const origin = request.headers.get("origin");
  if (
    !allowed.includes(url.origin) ||
    (origin !== null && origin !== url.origin) ||
    request.headers.get("sec-fetch-site") !== "same-origin" ||
    request.headers.get("x-vowedit-local") !== "1" ||
    request.headers.has("authorization") ||
    request.headers.has("x-vowedit-extension-origin") ||
    request.headers.get("content-type") !== "application/json"
  )
    return Response.json(
      { error: { code: "ORIGIN_REJECTED" } },
      { status: 403 },
    );
  const port = Number(process.env.VOWEDIT_API_PORT || 8000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    return new Response(null, { status: 503 });
  try {
    const result = await fetch(
      `http://127.0.0.1:${port}/api/browser-pairings`,
      {
        headers: {
          Origin: url.origin,
          "X-VowEdit-Local": "1",
          "Content-Type": "application/json",
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    return new Response(await result.text(), {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: { code: "CONNECTION_FAILED" } },
      { status: 503 },
    );
  }
}
