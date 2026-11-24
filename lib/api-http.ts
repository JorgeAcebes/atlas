import { NextResponse } from "next/server";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { apiRateLimiter, getClientIp, type RateLimitResult } from "@/lib/rate-limit";
import type { ApiAuthFailure } from "@/lib/api-auth";

export const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, X-API-Key, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers":
    "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After, Mcp-Session-Id",
};

/**
 * Resolves the canonical public base URL for links, OpenAPI server blocks, and MCP discovery.
 */
export function getAppBaseUrl(request?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      /* fallback below */
    }
  }

  if (request?.url) {
    try {
      const parsed = new URL(request.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      /* fallback below */
    }
  }

  return "https://atlas-log.vercel.app";
}

export function corsPreflightResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: API_CORS_HEADERS });
}

export function buildRateLimitHeaders(rate: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rate.remaining)),
  };
  if (!rate.success) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(rate.resetMs / 1000)));
  }
  return headers;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      ...API_CORS_HEADERS,
      ...(extraHeaders || {}),
    },
  });
}

export interface ProblemResponseOptions {
  status: number;
  code: string;
  title: string;
  detail: string;
  resolution?: string;
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;
  baseUrl?: string;
}

/**
 * Emits an RFC 9457 application/problem+json response with a stable `code` and `resolution`.
 */
export function problemResponse(options: ProblemResponseOptions): NextResponse {
  const {
    status,
    code,
    title,
    detail,
    resolution,
    extra,
    headers,
    baseUrl = getAppBaseUrl(),
  } = options;

  const body: Record<string, unknown> = {
    type: `${baseUrl}/developers#error-${code}`,
    title,
    status,
    code,
    detail,
    error: detail,
    ...(resolution ? { resolution } : {}),
    ...(extra || {}),
  };

  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      ...API_CORS_HEADERS,
      ...(headers || {}),
    },
  });
}

/**
 * Resolves a photo or avatar URL and guarantees an absolute URL when a relative proxy path is returned.
 */
export function toAbsoluteDisplayUrl(
  url: string | null | undefined,
  storagePath: string | null | undefined,
  baseUrl: string
): string {
  const displayUrl = getPhotoDisplayUrl(url, storagePath);
  if (!displayUrl) return "";
  if (displayUrl.startsWith("/")) {
    return `${baseUrl.replace(/\/+$/, "")}${displayUrl}`;
  }
  return displayUrl;
}

export function checkApiRateLimit(request: Request): {
  ok: true;
  headers: Record<string, string>;
} | {
  ok: false;
  response: NextResponse;
} {
  const ip = getClientIp(request);
  const rate = apiRateLimiter.check(ip);
  const headers = buildRateLimitHeaders(rate);
  if (!rate.success) {
    return {
      ok: false,
      response: problemResponse({
        status: 429,
        code: "rate_limit_exceeded",
        title: "Demasiadas peticiones",
        detail: "Has superado el límite de peticiones por minuto.",
        resolution: "Espera los segundos indicados en la cabecera Retry-After.",
        headers,
        baseUrl: getAppBaseUrl(request),
      }),
    };
  }
  return { ok: true, headers };
}

export function authFailureResponse(
  failure: ApiAuthFailure,
  baseUrl: string,
  extraHeaders?: Record<string, string>
): NextResponse {
  return problemResponse({
    status: failure.status,
    code: failure.code,
    title: failure.title,
    detail: failure.detail,
    resolution: failure.resolution,
    headers: {
      ...(extraHeaders || {}),
      ...(failure.headers || {}),
    },
    baseUrl,
  });
}
