import { corsPreflightResponse, getAppBaseUrl, jsonResponse } from "@/lib/api-http";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const cleanBase = getAppBaseUrl(request).replace(/\/+$/, "");

  return jsonResponse({
    version: "1.0.0",
    provider: {
      name: "Atlas",
      url: cleanBase,
    },
    artifacts: [
      {
        type: "application/mcp-server-card+json",
        url: `${cleanBase}/.well-known/mcp/server-card.json`,
      },
      {
        type: "application/openapi+json",
        url: `${cleanBase}/openapi.json`,
      },
      {
        type: "text/markdown",
        url: `${cleanBase}/llms.txt`,
      },
    ],
  });
}
