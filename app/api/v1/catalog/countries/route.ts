import { authenticateApiRequest } from "@/lib/api-auth";
import { checkApiRateLimit, corsPreflightResponse, jsonResponse } from "@/lib/api-http";
import { searchCountries } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const rateCheck = checkApiRateLimit(request);
  if (!rateCheck.ok) return rateCheck.response;

  await authenticateApiRequest(request, { optional: true });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const continent = searchParams.get("continent");
  const limitParam = searchParams.get("limit");

  const data = searchCountries({
    q,
    continent,
    limit: limitParam ? Number(limitParam) : undefined,
  });

  return jsonResponse(data, 200, rateCheck.headers);
}
