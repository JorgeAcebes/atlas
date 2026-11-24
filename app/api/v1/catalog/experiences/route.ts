import { authenticateApiRequest } from "@/lib/api-auth";
import {
  checkApiRateLimit,
  corsPreflightResponse,
  getAppBaseUrl,
  jsonResponse,
} from "@/lib/api-http";
import { handleServiceRouteError } from "@/lib/api-route-utils";
import { searchExperiences } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl(request);
  const rateCheck = checkApiRateLimit(request);
  if (!rateCheck.ok) return rateCheck.response;

  try {
    const authRes = await authenticateApiRequest(request, { optional: true });
    const auth = authRes.ok ? authRes.auth : null;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const category = searchParams.get("category");
    const limitParam = searchParams.get("limit");

    const data = await searchExperiences(
      {
        q,
        category,
        limit: limitParam ? Number(limitParam) : undefined,
      },
      auth
    );

    return jsonResponse(data, 200, rateCheck.headers);
  } catch (err) {
    return handleServiceRouteError(err, baseUrl, rateCheck.headers);
  }
}
