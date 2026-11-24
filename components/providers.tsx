"use client";

import { AuthProvider, type UserProfile } from "./auth-context";
import { PendingRequestsProvider } from "./pending-requests-context";
import { UploadQueueProvider } from "./upload-queue-context";
import { PwaZoomLock } from "./pwa-zoom-lock";

export function Providers({
  children,
  initialProfile = null,
}: {
  children: React.ReactNode;
  initialProfile?: UserProfile | null;
}) {
  return (
    <AuthProvider initialProfile={initialProfile}>
      <PendingRequestsProvider>
        <UploadQueueProvider>
          <PwaZoomLock />
          {children}
        </UploadQueueProvider>
      </PendingRequestsProvider>
    </AuthProvider>
  );
}
