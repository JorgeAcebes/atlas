"use client";

import { AuthProvider, type UserProfile } from "./auth-context";
import { PendingRequestsProvider } from "./pending-requests-context";
import { UploadQueueProvider } from "./upload-queue-context";
import { PwaZoomLock } from "./pwa-zoom-lock";
import { EntryIntroOverlay } from "./entry-intro-overlay";

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
          <EntryIntroOverlay />
          <PwaZoomLock />
          {children}
        </UploadQueueProvider>
      </PendingRequestsProvider>
    </AuthProvider>
  );
}
