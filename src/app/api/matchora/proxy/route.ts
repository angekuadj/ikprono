import { NextRequest, NextResponse } from "next/server";
import { fetchThroughProxy } from "@/lib/server/matchoraProxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_HOSTS = new Set([
  "matchora.pro",
  "matchora.to",
  "www.matchora.pro",
  "www.matchora.to",
]);

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function rewriteHtml(html: string, request: NextRequest): string {
  const origin = request.nextUrl.origin;

  // Rewrite absolute URLs to allowed hosts
  let rewritten = html
    .replace(/https:\/\/(www\.)?matchora\.(pro|to)/g, `${origin}/api/matchora/proxy?url=https://$1matchora.$2`)
    // Also handle protocol-relative if any
    .replace(/\/\//g, "/")
    // Fix the double slash issue from above replacement in some cases? be more careful
    ;

  // Better approach: rewrite specific patterns
  rewritten = html.replace(
    /(src|href|action)=["']https?:\/\/(www\.)?matchora\.(pro|to)([^"']*)["']/gi,
    (match, attr, www, tld, path) => {
      const targetUrl = `https://${www || ""}matchora.${tld}${path}`;
      return `${attr}="${origin}/api/matchora/proxy?url=${encodeURIComponent(targetUrl)}"`;
    }
  );

  // Rewrite fetch/XHR/WebSocket references in inline scripts? basic
  rewritten = rewritten.replace(
    /["']https?:\/\/(www\.)?matchora\.(pro|to)(\/[^"']*)["']/g,
    (match, www, tld, path) => {
      const targetUrl = `https://${www || ""}matchora.${tld}${path}`;
      return `"${origin}/api/matchora/proxy?url=${encodeURIComponent(targetUrl)}"`;
    }
  );

  // Inject base tag to help relative URLs
  if (!/<base\s/i.test(rewritten)) {
    rewritten = rewritten.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${origin}/api/matchora/proxy?url=${encodeURIComponent("https://matchora.to/")}">`
    );
  }

  return rewritten;
}

function rewriteCss(css: string, request: NextRequest): string {
  const origin = request.nextUrl.origin;
  return css.replace(
    /url\(\s*["']?https?:\/\/(www\.)?matchora\.(pro|to)([^)"']*)["']?\s*\)/gi,
    (match, www, tld, path) => {
      const targetUrl = `https://${www || ""}matchora.${tld}${path}`;
      return `url(${origin}/api/matchora/proxy?url=${encodeURIComponent(targetUrl)})`;
    }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (!isAllowedUrl(target)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const headers = new Headers();
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    headers.set("Accept", request.headers.get("accept") || "*/*");
    headers.set("Accept-Language", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7");
    headers.set("Referer", "https://matchora.to/");
    headers.set("Origin", "https://matchora.to");

    // Forward some headers
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);

    const response = await fetchThroughProxy(target, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "follow",
    } as RequestInit);

    const contentType = response.headers.get("content-type") || "";
    const location = response.headers.get("location");

    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      if (location && isAllowedUrl(location)) {
        const origin = request.nextUrl.origin;
        return NextResponse.redirect(`${origin}/api/matchora/proxy?url=${encodeURIComponent(location)}`, response.status);
      }
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    // Copy relevant headers
    const passThroughHeaders = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];
    for (const h of passThroughHeaders) {
      const v = response.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }

    // Handle HTML
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const rewritten = rewriteHtml(html, request);
      responseHeaders.set("Content-Type", "text/html; charset=utf-8");
      return new NextResponse(rewritten, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // Handle CSS
    if (contentType.includes("text/css")) {
      const css = await response.text();
      const rewritten = rewriteCss(css, request);
      responseHeaders.set("Content-Type", "text/css; charset=utf-8");
      return new NextResponse(rewritten, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // Handle JavaScript
    if (contentType.includes("javascript") || contentType.includes("text/javascript")) {
      let js = await response.text();
      const origin = request.nextUrl.origin;
      // Rewrite URLs in JS
      js = js.replace(
        /https?:\/\/(www\.)?matchora\.(pro|to)(\/[^\s"'`\\)]+)?/g,
        (match) => {
          if (isAllowedUrl(match)) {
            return `${origin}/api/matchora/proxy?url=${encodeURIComponent(match)}`;
          }
          return match;
        }
      );
      responseHeaders.set("Content-Type", contentType || "application/javascript");
      return new NextResponse(js, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // Handle m3u8 and other text
    if (contentType.includes("application/vnd.apple.mpegurl") || contentType.includes("application/x-mpegURL") || target.includes(".m3u8")) {
      let playlist = await response.text();
      const origin = request.nextUrl.origin;
      const baseUrl = target.substring(0, target.lastIndexOf("/") + 1);
      
      // Rewrite segment URLs
      playlist = playlist.split("\n").map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          // Rewrite URI= in tags
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (m, uri) => {
              try {
                const absolute = new URL(uri, baseUrl).toString();
                if (isAllowedUrl(absolute)) {
                  return `URI="${origin}/api/matchora/proxy?url=${encodeURIComponent(absolute)}"`;
                }
              } catch {}
              return m;
            });
          }
          return trimmed;
        }
        // It's a segment URL
        try {
          const absolute = new URL(trimmed, baseUrl).toString();
          if (isAllowedUrl(absolute)) {
            return `${origin}/api/matchora/proxy?url=${encodeURIComponent(absolute)}`;
          }
        } catch {}
        return trimmed;
      }).join("\n");
      
      responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      return new NextResponse(playlist, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // For binary data (ts segments, images, etc.) stream through
    const body = response.body;
    return new NextResponse(body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Matchora proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request" },
      { status: 502 }
    );
  }
}
