import https from "https";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";

function getProxyAgent(url: string) {
  const proxyUrl = process.env.MATCHORA_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;
  
  if (!proxyUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return new HttpsProxyAgent(proxyUrl);
    }
    return new HttpProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

export async function fetchThroughProxy(targetUrl: string, init: RequestInit = {}): Promise<Response> {
  const proxyUrl = process.env.MATCHORA_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;
  
  if (!proxyUrl) {
    // Pas de proxy configuré, fetch direct
    return fetch(targetUrl, init);
  }

  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === "https:";
      const agent = getProxyAgent(targetUrl);
      
      const headers: Record<string, string> = {};
      if (init.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => {
            headers[k] = v;
          });
        } else {
          Object.assign(headers, init.headers);
        }
      }

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: init.method || "GET",
        headers,
        agent,
      };

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const responseInit: ResponseInit = {
            status: res.statusCode || 200,
            statusText: res.statusMessage || "OK",
            headers: new Headers(),
          };
          
          Object.entries(res.headers).forEach(([key, value]) => {
            if (value) {
              if (Array.isArray(value)) {
                value.forEach(v => (responseInit.headers as Headers).append(key, v));
              } else {
                (responseInit.headers as Headers).set(key, value);
              }
            }
          });
          
          resolve(new Response(body, responseInit));
        });
      });

      req.on("error", reject);
      
      if (init.body) {
        if (typeof init.body === "string") {
          req.write(init.body);
        } else if (init.body instanceof Buffer) {
          req.write(init.body);
        } else {
          // Pour les autres types, essayer
          req.write(String(init.body));
        }
      }
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}
