import { describe, it, expect, vi } from "vitest";
import { notifyPendingChanged } from "@/lib/events";
import fs from "fs";
import path from "path";

describe("Inbox Modal & Pending Requests Requirements", () => {
  const inboxFilePath = path.join(process.cwd(), "components/inbox-modal.tsx");
  const inboxSource = fs.readFileSync(inboxFilePath, "utf-8");

  it("Header subtitle must display 'Solicitudes de seguimiento y viajes compartidos'", () => {
    expect(inboxSource).toContain("Solicitudes de seguimiento y viajes compartidos");
    // Ensure old subtitle is removed
    expect(inboxSource).not.toContain("Invitaciones de compañeros de ruta y viaje");
  });

  it("Tabs must be 'Solicitudes' on the left and 'Registros compartidos' on the right", () => {
    expect(inboxSource).toContain("<span>Solicitudes</span>");
    expect(inboxSource).toContain("<span>Registros compartidos</span>");
  });

  it("Neither tab should display number of requests in parentheses", () => {
    // Ensure no ({length}) or (number) pattern exists in tab labels
    expect(inboxSource).not.toMatch(/<span>Solicitudes\s*\([^)]*\)<\/span>/);
    expect(inboxSource).not.toMatch(/<span>Registros compartidos\s*\([^)]*\)<\/span>/);
    expect(inboxSource).not.toContain("Viajes compartidos (");
  });

  it("Asterisk footnote about photos and notes is removed", () => {
    expect(inboxSource).not.toContain("* Al aceptar, se añadirá a tu mapa sin fotos ni notas personales.");
  });

  it("Accepted trips list ('Desvincular') is removed from inbox modal", () => {
    expect(inboxSource).not.toContain("unlinkCompanion");
    expect(inboxSource).not.toContain("Desvincular");
  });

  it("notifyPendingChanged dispatches atlas:pending-changed window event", () => {
    const dispatchEventMock = vi.fn();
    (global as any).window = {
      dispatchEvent: dispatchEventMock,
    };
    (global as any).CustomEvent = class CustomEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };

    notifyPendingChanged();

    expect(dispatchEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventMock.mock.calls[0][0].type).toBe("atlas:pending-changed");

    delete (global as any).window;
    delete (global as any).CustomEvent;
  });
});
