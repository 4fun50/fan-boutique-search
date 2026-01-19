export default async (req) => {
  try {
    const env = globalThis.Netlify?.env;
    const getEnv = (key) => {
      try {
        if (env && typeof env.get === "function") {
          const v = env.get(key);
          if (typeof v === "string" && v.trim()) return v;
        }
      } catch {
        // ignore
      }

      try {
        if (env && typeof env[key] === "string" && env[key].trim()) {
          return env[key];
        }
      } catch {
        // ignore
      }

      if (
        typeof process !== "undefined" &&
        process.env &&
        typeof process.env[key] === "string" &&
        process.env[key].trim()
      ) {
        return process.env[key];
      }

      return "";
    };

    const requestOrigin = req.headers.get("origin") || "";
    const configuredAllowedOrigins = getEnv("FB_ALLOWED_ORIGINS");
    const allowedOrigins = new Set(
      configuredAllowedOrigins
        ? configuredAllowedOrigins
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [] // Configurer FB_ALLOWED_ORIGINS dans les variables d'environnement Netlify
    );
    const isAllowedOrigin = requestOrigin && allowedOrigins.has(requestOrigin);

    const corsHeaders = isAllowedOrigin
      ? {
          "Access-Control-Allow-Origin": requestOrigin,
          Vary: "Origin",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }
      : {};

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: isAllowedOrigin ? 204 : 403,
        headers: {
          ...corsHeaders,
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed", allowed: ["POST"] }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const n8nWebhookUrl = getEnv("N8N_WEBHOOK_URL");
    const authHeaderName = getEnv("N8N_AUTH_HEADER_NAME");
    const authHeaderValue = getEnv("N8N_AUTH_HEADER_VALUE");

    const missingEnv = [];
    if (!n8nWebhookUrl) missingEnv.push("N8N_WEBHOOK_URL");
    if (!authHeaderName) missingEnv.push("N8N_AUTH_HEADER_NAME");
    if (!authHeaderValue) missingEnv.push("N8N_AUTH_HEADER_VALUE");

    if (missingEnv.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Server misconfigured",
          missing_env: missingEnv,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const query =
      typeof payload?.query === "string" ? payload.query.trim() : "";
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const sanitizeIp = (value) => {
      const raw = typeof value === "string" ? value.trim() : "";
      if (!raw) return "";
      const cleaned = raw.replace(/\s+/g, "");
      if (!/^[0-9a-fA-F:.]+$/.test(cleaned)) return "";
      return cleaned;
    };

    const pickClientIpFromForwardedFor = (xff) => {
      const raw = typeof xff === "string" ? xff : "";
      if (!raw) return "";
      const first = raw.split(",")[0]?.trim() || "";
      return sanitizeIp(first);
    };

    const netlifyClientIp = sanitizeIp(
      req.headers.get("x-nf-client-connection-ip")
    );
    const forwardedForHeader = req.headers.get("x-forwarded-for") || "";
    const clientIp =
      netlifyClientIp ||
      pickClientIpFromForwardedFor(forwardedForHeader) ||
      sanitizeIp(req.headers.get("x-real-ip")) ||
      sanitizeIp(req.headers.get("cf-connecting-ip")) ||
      "";

    const headers = {
      "Content-Type": "application/json",
    };

    if (authHeaderName && authHeaderValue) {
      headers[authHeaderName] = authHeaderValue;
    }

    if (clientIp) {
      headers["X-Real-IP"] = clientIp;
      headers["X-Forwarded-For"] = forwardedForHeader || clientIp;
    }

    let upstream;
    try {
      upstream = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, client_ip: clientIp }),
      });
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "Failed to reach upstream webhook",
          message: e?.message || String(e),
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const bodyText = await upstream.text();
    let bodyJson;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = {
        error: "Upstream returned non-JSON response",
        status: upstream.status,
        body: bodyText,
      };
    }

    return new Response(JSON.stringify(bodyJson), {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    console.error("Unhandled error in search function", e);

    const requestOrigin = req?.headers?.get("origin") || "";
    // En cas d'erreur, pas de CORS permissif - les origines doivent être configurées via FB_ALLOWED_ORIGINS
    const fallbackCorsHeaders = {};

    return new Response(
      JSON.stringify({
        error: "Unhandled server error",
        message: e?.message || String(e),
      }),
      {
        status: 500,
        headers: {
          ...fallbackCorsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
};
