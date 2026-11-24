import { corsPreflightResponse, jsonResponse } from "@/lib/api-http";
import { guardAuthenticatedApi, handleServiceRouteError } from "@/lib/api-route-utils";
import { getAuthenticatedUserSummary } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "read" });
  if (!guard.ok) return guard.response;

  try {
    const summary = await getAuthenticatedUserSummary(guard.auth, guard.baseUrl);
    return jsonResponse(summary, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}
