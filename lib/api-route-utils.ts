import type { NextResponse } from "next/server";
import { authenticateApiRequest, type ApiScope, type AuthenticatedApiContext } from "@/lib/api-auth";
import {
  authFailureResponse,
  checkApiRateLimit,
  getAppBaseUrl,
  problemResponse,
} from "@/lib/api-http";
import { AtlasServiceError } from "@/lib/atlas-service";

export async function guardAuthenticatedApi(
  request: Request,
  options?: {
    requiredScope?: ApiScope;
    allowApiKey?: boolean;
    supabaseAdminOverride?: any;
  }
): Promise<
  | { ok: true; auth: AuthenticatedApiContext; baseUrl: string; headers: Record<string, string> }
  | { ok: false; response: NextResponse }
> {
  const baseUrl = getAppBaseUrl(request);
  const rateCheck = checkApiRateLimit(request);
  if (!rateCheck.ok) return rateCheck;

  const authRes = await authenticateApiRequest(request, options);
  if (!authRes.ok || !authRes.auth) {
    const failure = !authRes.ok
      ? authRes
      : {
          ok: false as const,
          status: 401,
          code: "unauthorized",
          title: "Autenticación requerida",
          detail: "Falta el token de autenticación.",
          resolution: "Genera una API Key en /developers.",
        };
    return {
      ok: false,
      response: authFailureResponse(failure, baseUrl, rateCheck.headers),
    };
  }

  return { ok: true, auth: authRes.auth, baseUrl, headers: rateCheck.headers };
}

export function handleServiceRouteError(
  err: unknown,
  baseUrl: string,
  headers?: Record<string, string>
): NextResponse {
  if (err instanceof AtlasServiceError) {
    return problemResponse({
      status: err.status,
      code: err.code,
      title: err.title,
      detail: err.message,
      resolution: err.resolution,
      extra: err.extra,
      headers,
      baseUrl,
    });
  }
  console.error("[Atlas API v1 Error]", err);
  return problemResponse({
    status: 500,
    code: "internal_error",
    title: "Error interno del servidor",
    detail: "Se produjo un error inesperado procesando la solicitud.",
    headers,
    baseUrl,
  });
}
