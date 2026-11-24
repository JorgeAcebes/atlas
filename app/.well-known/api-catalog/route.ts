import { NextResponse } from "next/server";
import { API_CORS_HEADERS, corsPreflightResponse, getAppBaseUrl } from "@/lib/api-http";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const cleanBase = getAppBaseUrl(request).replace(/\/+$/, "");

  const linkset = {
    linkset: [
      {
        anchor: `${cleanBase}/api/v1`,
        "service-desc": [
          {
            href: `${cleanBase}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${cleanBase}/developers`,
            type: "text/html",
          },
        ],
        describedby: [
          {
            href: `${cleanBase}/llms.txt`,
            type: "text/markdown",
          },
        ],
      },
    ],
  };

  return new NextResponse(JSON.stringify(linkset, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      ...API_CORS_HEADERS,
    },
  });
}
