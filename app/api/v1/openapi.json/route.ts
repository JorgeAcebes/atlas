import { NextResponse } from "next/server";
import { API_CORS_HEADERS, corsPreflightResponse, getAppBaseUrl } from "@/lib/api-http";
import { buildOpenApiSpec } from "@/lib/openapi-spec";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const spec = buildOpenApiSpec(getAppBaseUrl(request));
  return new NextResponse(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/openapi+json; charset=utf-8",
      ...API_CORS_HEADERS,
    },
  });
}
