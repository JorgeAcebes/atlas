"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, Terminal, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { AuthDialog } from "@/components/auth-dialog";
import { supabase } from "@/lib/supabase";

interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

type SnippetTab = "mcp" | "multipart" | "base64" | "presigned";

const ALL_SCOPES = [
  { id: "read", label: "read (perfil, registros, fotos)" },
  { id: "photos:write", label: "photos:write (subir, editar y borrar fotos)" },
  { id: "records:write", label: "records:write (registrar países, picos y experiencias)" },
];

export function DevelopersClient({ initialOrigin }: { initialOrigin: string }) {
  const { session, profile, loading: authLoading } = useAuth();
  const [origin, setOrigin] = useState(initialOrigin);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState("");

  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "read",
    "photos:write",
    "records:write",
  ]);
  const [expiresInDays, setExpiresInDays] = useState<string>("365");
  const [creating, setCreating] = useState(false);
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SnippetTab>("mcp");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

  const resolveAccessToken = useCallback(async (): Promise<string | null> => {
    if (session?.access_token) return session.access_token;
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }, [session?.access_token]);

  const loadKeys = useCallback(async () => {
    const token = await resolveAccessToken();
    if (!token) {
      setKeys([]);
      return;
    }
    setKeysLoading(true);
    setKeysError("");
    try {
      const res = await fetch("/api/v1/keys", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setKeysError(data?.detail || data?.error || "No se pudieron cargar tus API Keys.");
      } else {
        setKeys(Array.isArray(data?.keys) ? data.keys : []);
      }
    } catch {
      setKeysError("Error de red al consultar tus API Keys.");
    } finally {
      setKeysLoading(false);
    }
  }, [resolveAccessToken]);

  useEffect(() => {
    if (!authLoading && session?.user?.id) {
      void loadKeys();
    } else if (!authLoading && !session) {
      setKeys([]);
    }
  }, [authLoading, session, loadKeys]);

  const copyText = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      /* ignore clipboard errors */
    }
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) => {
      if (prev.includes(scopeId)) {
        if (prev.length === 1) return prev; // Keep at least one scope
        return prev.filter((s) => s !== scopeId);
      }
      return [...prev, scopeId];
    });
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKeyName.trim();
    if (!trimmed) {
      setKeysError("Introduce un nombre para identificar la API Key.");
      return;
    }
    const token = await resolveAccessToken();
    if (!token) {
      setShowAuthDialog(true);
      return;
    }

    setCreating(true);
    setKeysError("");
    setNewlyCreatedSecret(null);

    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmed,
          scopes: selectedScopes,
          expires_in_days: expiresInDays === "never" ? null : Number(expiresInDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeysError(data?.detail || data?.error || "No se pudo crear la API Key.");
      } else {
        setNewlyCreatedSecret(data.api_key);
        setNewKeyName("");
        await loadKeys();
      }
    } catch {
      setKeysError("Error de red al crear la API Key.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    const token = await resolveAccessToken();
    if (!token) return;
    setKeysError("");
    try {
      const res = await fetch(`/api/v1/keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setKeysError(data?.detail || data?.error || "No se pudo revocar la clave.");
      } else {
        await loadKeys();
      }
    } catch {
      setKeysError("Error de red al revocar la API Key.");
    }
  };

  const tokenPlaceholder = newlyCreatedSecret || "atlas_live_YOUR_API_KEY";
  const cleanOrigin = origin.replace(/\/+$/, "");

  const snippets: Record<SnippetTab, { label: string; code: string }> = {
    mcp: {
      label: "MCP Config (JSON)",
      code: JSON.stringify(
        {
          mcpServers: {
            atlas: {
              type: "http",
              url: `${cleanOrigin}/mcp`,
              headers: {
                Authorization: `Bearer ${tokenPlaceholder}`,
              },
            },
          },
        },
        null,
        2
      ),
    },
    multipart: {
      label: "REST Multipart",
      code: `curl -X POST "${cleanOrigin}/api/v1/photos" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -F "summit_id=country-jp" \\
  -F "taken_on=2025-04-12" \\
  -F "caption=Monte Fuji al amanecer" \\
  -F "auto_create_record=true" \\
  -F "file=@./fuji.jpg"`,
    },
    base64: {
      label: "REST JSON Base64",
      code: `curl -X POST "${cleanOrigin}/api/v1/photos" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "summit_id": "granada",
    "taken_on": "2025-07-20",
    "caption": "Cumbre del Mulhacén",
    "file_name": "mulhacen.jpg",
    "image_base64": "data:image/jpeg;base64,/9j/4AAQ..."
  }'`,
    },
    presigned: {
      label: "Large Photo (3.2–15 MB)",
      code: `# 1. Request presigned R2 PUT URL + upload_token
INTENT=$(curl -s -X POST "${cleanOrigin}/api/v1/photos/upload-intent" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"summit_id":"country-is","file_name":"aurora.jpg","content_type":"image/jpeg","file_size":6291456,"taken_on":"2025-11-04"}')

# 2. Upload raw bytes directly to Cloudflare R2
curl -X PUT "$(echo $INTENT | jq -r .upload_url)" \\
  -H "Content-Type: image/jpeg" \\
  --data-binary @./aurora.jpg

# 3. Verify, Sharp-optimize & register in Atlas
curl -X POST "${cleanOrigin}/api/v1/photos/confirm" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"upload_token\\":\\"$(echo $INTENT | jq -r .upload_token)\\"}"`,
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Discovery Endpoints */}
      <section
        style={{
          background: "#fff",
          border: "1px solid var(--line, #dce4da)",
          borderRadius: "14px",
          padding: "1.25rem 1.35rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.85rem",
          }}
        >
          <Terminal size={18} style={{ color: "var(--pine, #245f52)" }} />
          <h2
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.25rem",
              margin: 0,
              color: "var(--ink, #18342d)",
            }}
          >
            Endpoints de Descubrimiento y MCP
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {[
            { label: "MCP Streamable HTTP", path: "/mcp" },
            { label: "OpenAPI 3.1 Spec", path: "/openapi.json" },
            { label: "LLMs Index (Markdown)", path: "/llms.txt" },
            { label: "MCP Server Card", path: "/.well-known/mcp/server-card.json" },
          ].map((item) => {
            const fullUrl = `${cleanOrigin}${item.path}`;
            return (
              <div
                key={item.path}
                style={{
                  border: "1px solid var(--line, #dce4da)",
                  borderRadius: "10px",
                  padding: "0.75rem 0.9rem",
                  background: "var(--paper, #faf8f1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--muted, #62716b)",
                  }}
                >
                  {item.label}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                  }}
                >
                  <a
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "0.8rem",
                      color: "var(--pine, #245f52)",
                      textDecoration: "underline",
                      wordBreak: "break-all",
                    }}
                  >
                    {item.path}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(item.path, fullUrl)}
                    aria-label={`Copiar ${item.label}`}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--line, #dce4da)",
                      borderRadius: "6px",
                      padding: "0.25rem 0.4rem",
                      cursor: "pointer",
                      color: "var(--ink, #18342d)",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    {copiedId === item.path ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Personal API Keys Manager */}
      <section
        style={{
          background: "#fff",
          border: "1px solid var(--line, #dce4da)",
          borderRadius: "14px",
          padding: "1.25rem 1.35rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <KeyRound size={18} style={{ color: "var(--pine, #245f52)" }} />
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.25rem",
                margin: 0,
                color: "var(--ink, #18342d)",
              }}
            >
              Claves Personales de API (API Keys)
            </h2>
          </div>
          {profile?.username && (
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.78rem",
                color: "var(--pine, #245f52)",
                background: "rgba(36, 95, 82, 0.08)",
                padding: "0.2rem 0.55rem",
                borderRadius: "999px",
              }}
            >
              @{profile.username}
            </span>
          )}
        </div>

        <p style={{ fontSize: "0.9rem", color: "var(--muted, #62716b)", margin: "0 0 1rem" }}>
          Genera una clave <code>atlas_live_...</code> para que cualquier agente IA (Claude Desktop,
          Cursor, Antigravity o scripts propios) pueda registrar viajes y subir tus fotos de forma segura.
        </p>

        {!authLoading && !session ? (
          <div
            style={{
              background: "var(--paper, #faf8f1)",
              border: "1px dashed var(--line, #dce4da)",
              borderRadius: "10px",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.92rem" }}>
              Inicia sesión en tu cuenta de Atlas para generar y revocar tus API Keys personales.
            </p>
            <button
              type="button"
              className="button button--green"
              onClick={() => setShowAuthDialog(true)}
            >
              Iniciar sesión
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <form
              onSubmit={handleCreateKey}
              style={{
                background: "var(--paper, #faf8f1)",
                border: "1px solid var(--line, #dce4da)",
                borderRadius: "10px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1fr) minmax(140px, 180px)",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <label
                    htmlFor="atlas-api-key-name"
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      marginBottom: "0.25rem",
                    }}
                  >
                    Nombre de la clave
                  </label>
                  <input
                    id="atlas-api-key-name"
                    type="text"
                    maxLength={80}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Ej: Claude Desktop, Script fotos..."
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.65rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5cf",
                      fontSize: "0.9rem",
                      background: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="atlas-api-key-expiry"
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      marginBottom: "0.25rem",
                    }}
                  >
                    Caducidad
                  </label>
                  <select
                    id="atlas-api-key-expiry"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.65rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5cf",
                      fontSize: "0.9rem",
                      background: "#fff",
                    }}
                  >
                    <option value="30">30 días</option>
                    <option value="90">90 días</option>
                    <option value="365">1 año</option>
                    <option value="never">Sin caducidad</option>
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Permisos (scopes)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
                  {ALL_SCOPES.map((sc) => (
                    <label
                      key={sc.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        fontSize: "0.82rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(sc.id)}
                        onChange={() => toggleScope(sc.id)}
                      />
                      <span>{sc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="button button--green"
                  disabled={creating}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Plus size={16} />
                  {creating ? "Generando..." : "Generar API Key"}
                </button>
              </div>
            </form>

            {newlyCreatedSecret && (
              <div
                style={{
                  background: "#eef6f2",
                  border: "1px solid #245f52",
                  borderRadius: "10px",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "#245f52",
                  }}
                >
                  <ShieldCheck size={16} />
                  Guarda tu nueva API Key ahora (no se volverá a mostrar completa):
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    background: "#fff",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid #c6dcd3",
                  }}
                >
                  <code
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "0.83rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {newlyCreatedSecret}
                  </code>
                  <button
                    type="button"
                    className="button button--outline"
                    onClick={() => copyText("new-secret", newlyCreatedSecret)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copiedId === "new-secret" ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === "new-secret" ? "¡Copiada!" : "Copiar clave"}
                  </button>
                </div>
              </div>
            )}

            {keysError && (
              <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.88rem" }}>{keysError}</p>
            )}

            {keysLoading ? (
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted, #62716b)" }}>
                Cargando claves...
              </p>
            ) : keys.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted, #62716b)" }}>
                Aún no has creado ninguna API Key personal.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {keys.map((k) => {
                  const isRevoked = Boolean(k.revoked_at);
                  const isExpired =
                    !isRevoked && k.expires_at ? new Date(k.expires_at).getTime() <= Date.now() : false;

                  return (
                    <div
                      key={k.id}
                      style={{
                        border: "1px solid var(--line, #dce4da)",
                        borderRadius: "10px",
                        padding: "0.75rem 0.9rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        opacity: isRevoked || isExpired ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <strong style={{ fontSize: "0.92rem" }}>{k.name}</strong>
                          <code
                            style={{
                              fontFamily: "'DM Mono', monospace",
                              fontSize: "0.78rem",
                              color: "var(--muted, #62716b)",
                            }}
                          >
                            {k.key_prefix}••••
                          </code>
                          {isRevoked && (
                            <span style={{ fontSize: "0.72rem", color: "#b91c1c", fontWeight: 600 }}>
                              Revocada
                            </span>
                          )}
                          {isExpired && (
                            <span style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: 600 }}>
                              Expirada
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.76rem",
                            color: "var(--muted, #62716b)",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.65rem",
                          }}
                        >
                          <span>Scopes: {(k.scopes || []).join(", ")}</span>
                          {k.last_used_at && (
                            <span>
                              Último uso: {new Date(k.last_used_at).toLocaleDateString("es-ES")}
                            </span>
                          )}
                          {k.expires_at && (
                            <span>
                              Caduca: {new Date(k.expires_at).toLocaleDateString("es-ES")}
                            </span>
                          )}
                        </div>
                      </div>

                      {!isRevoked && (
                        <button
                          type="button"
                          onClick={() => handleRevokeKey(k.id)}
                          className="button button--outline"
                          style={{
                            color: "#a34f3d",
                            borderColor: "#e6c7c0",
                            fontSize: "0.8rem",
                            padding: "0.35rem 0.65rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <Trash2 size={14} />
                          Revocar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Copy-Paste Integration Snippets */}
      <section
        style={{
          background: "#fff",
          border: "1px solid var(--line, #dce4da)",
          borderRadius: "14px",
          padding: "1.25rem 1.35rem",
        }}
      >
        <h2
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.25rem",
            margin: "0 0 0.75rem",
            color: "var(--ink, #18342d)",
          }}
        >
          Ejemplos de Integración (MCP &amp; REST)
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.85rem" }}>
          {(Object.keys(snippets) as SnippetTab[]).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: "999px",
                border: "1px solid var(--line, #dce4da)",
                background:
                  activeTab === tabKey ? "var(--pine, #245f52)" : "var(--paper, #faf8f1)",
                color: activeTab === tabKey ? "#fff" : "var(--ink, #18342d)",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {snippets[tabKey].label}
            </button>
          ))}
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => copyText(`snippet-${activeTab}`, snippets[activeTab].code)}
            style={{
              position: "absolute",
              top: "0.65rem",
              right: "0.65rem",
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #cbd5cf",
              borderRadius: "6px",
              padding: "0.3rem 0.55rem",
              fontSize: "0.75rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            {copiedId === `snippet-${activeTab}` ? <Check size={13} /> : <Copy size={13} />}
            {copiedId === `snippet-${activeTab}` ? "Copiado" : "Copiar"}
          </button>
          <pre
            style={{
              margin: 0,
              padding: "1rem",
              paddingRight: "5.5rem",
              background: "#132924",
              color: "#eaf2ef",
              borderRadius: "10px",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.78rem",
              lineHeight: 1.55,
              overflowX: "auto",
            }}
          >
            <code>{snippets[activeTab].code}</code>
          </pre>
        </div>
      </section>

      {showAuthDialog && (
        <AuthDialog initialTab="login" onClose={() => setShowAuthDialog(false)} />
      )}
    </div>
  );
}
