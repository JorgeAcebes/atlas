import { usePendingRequestsContext } from "./pending-requests-context";

export function usePendingTripInvitations() {
  const { hasPendingInvitations, pendingCount, refreshPending } = usePendingRequestsContext();
  return {
    hasPendingInvitations,
    pendingCount,
    refreshPending,
  };
}
