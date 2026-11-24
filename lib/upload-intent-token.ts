import crypto from "node:crypto";
import { hasUnsafePathTraversal } from "@/lib/photo-security";

export interface UploadIntentPayload {
  userId: string;
  storagePath: string;
  summitId: string;
  expectedSummitId: string;
  subItemId: string | null;
  itemType: "country" | "peak" | "experience";
  takenOn: string;
  caption: string | null;
  shotAt: string | null;
  autoCreateRecord: boolean;
  recordMeta: {
    notes?: string | null;
    endDate?: string | null;
    link?: string | null;
    linkName?: string | null;
    link2?: string | null;
    linkName2?: string | null;
    lat?: number | null;
    lng?: number | null;
    locationName?: string | null;
  } | null;
  contentType: string;
  declaredFileSize: number;
  exp: number;
}

function getIntentSecret(): string {
  const secret =
    process.env.ATLAS_UPLOAD_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("ATLAS_UPLOAD_TOKEN_SECRET o SUPABASE_SERVICE_ROLE_KEY requerido para firmar tokens de subida.");
  }
  return secret;
}

function signDigest(encodedPayload: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest();
}

/**
 * Signs a stateless upload intent token (`v1.<payload>.<sig>`).
 */
export function signUploadIntentToken(
  payload: UploadIntentPayload,
  secretOverride?: string
): string {
  const secret = secretOverride || getIntentSecret();
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signDigest(encodedPayload, secret).toString("base64url");
  return `v1.${encodedPayload}.${sig}`;
}

export type VerifyUploadIntentResult =
  | { ok: true; payload: UploadIntentPayload }
  | { ok: false; code: string; detail: string };

/**
 * Verifies signature, expiration, ownership, and storage path safety of an upload intent token.
 */
export function verifyUploadIntentToken(
  token: string,
  expectedUserId: string,
  secretOverride?: string
): VerifyUploadIntentResult {
  if (!token || typeof token !== "string") {
    return { ok: false, code: "invalid_upload_token", detail: "upload_token requerido." };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) {
    return { ok: false, code: "invalid_upload_token", detail: "Formato de upload_token inválido." };
  }

  let secret: string;
  try {
    secret = secretOverride || getIntentSecret();
  } catch (err: any) {
    return {
      ok: false,
      code: "server_misconfigured",
      detail: err?.message || "Configuración de firma incompleta.",
    };
  }

  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, code: "invalid_upload_token", detail: "Firma de upload_token malformada." };
  }

  const expectedSig = signDigest(parts[1], secret);
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return { ok: false, code: "invalid_upload_token", detail: "Firma de upload_token inválida." };
  }

  let payload: UploadIntentPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, code: "invalid_upload_token", detail: "Payload de upload_token corrupto." };
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Date.now()
  ) {
    return {
      ok: false,
      code: "upload_token_expired",
      detail: "El upload_token ha expirado. Solicita un nuevo upload-intent.",
    };
  }

  if (payload.userId !== expectedUserId) {
    return {
      ok: false,
      code: "forbidden",
      detail: "El upload_token no pertenece al usuario autenticado.",
    };
  }

  if (
    typeof payload.storagePath !== "string" ||
    hasUnsafePathTraversal(payload.storagePath) ||
    !payload.storagePath.startsWith(`${expectedUserId}/`)
  ) {
    return {
      ok: false,
      code: "invalid_storage_path",
      detail: "Ruta de almacenamiento inválida en el upload_token.",
    };
  }

  return { ok: true, payload };
}
