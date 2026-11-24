import { corsPreflightResponse, getAppBaseUrl, jsonResponse } from "@/lib/api-http";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const cleanBase = getAppBaseUrl(request).replace(/\/+$/, "");

  return jsonResponse({
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "app.vercel.atlas-log/atlas-mcp",
    title: "Atlas Travel Log & Photo MCP",
    version: "1.0.0",
    description:
      "Search 196 countries, 47 unique Spanish provincial peaks, and adventure experiences; log travel records; and upload/optimize photos directly into Atlas.",
    websiteUrl: `${cleanBase}/developers`,
    icons: [
      {
        src: `${cleanBase}/icon-512.png`,
        mimeType: "image/png",
        sizes: ["512x512"],
      },
    ],
    remotes: [
      {
        type: "streamable-http",
        url: `${cleanBase}/mcp`,
        headers: [
          {
            name: "Authorization",
            description:
              "Personal API Key (`Bearer atlas_live_...` generated at /developers) or Supabase user JWT",
            isRequired: false,
            isSecret: true,
          },
        ],
      },
    ],
    documentation: `${cleanBase}/llms.txt`,
    openApiSpec: `${cleanBase}/openapi.json`,
  });
}
