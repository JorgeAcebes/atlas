import { notifyPendingChanged } from "@/lib/events";
import { usePendingRequestsContext } from "./pending-requests-context";

export { notifyPendingChanged };

export function usePendingRequests() {
  return usePendingRequestsContext().hasPendingRequests;
}
