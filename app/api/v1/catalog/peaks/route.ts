import { checkApiRateLimit, corsPreflightResponse, jsonResponse } from "@/lib/api-http";
import { searchPeaks } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const rateCheck = checkApiRateLimit(request);
  if (!rateCheck.ok) return rateCheck.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const province = searchParams.get("province");
  const limitParam = searchParams.get("limit");

  const data = searchPeaks({
    q,
    province,
    limit: limitParam ? Number(limitParam) : undefined,
  });

  return jsonResponse(data, 200, rateCheck.headers);
}
