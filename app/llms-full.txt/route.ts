import { NextResponse } from "next/server";
import { API_CORS_HEADERS, corsPreflightResponse, getAppBaseUrl } from "@/lib/api-http";
import { buildLlmsFullTxt } from "@/lib/llms-docs";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const markdown = buildLlmsFullTxt(getAppBaseUrl(request));
  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      ...API_CORS_HEADERS,
    },
  });
}
