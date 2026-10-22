export function notifyPendingChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("atlas:pending-changed"));
  }
}
