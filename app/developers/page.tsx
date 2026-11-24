import type { Metadata } from "next";
import Link from "next/link";
import { DevelopersClient } from "@/components/developers-client";

export const metadata: Metadata = {
  title: "API & MCP para Agentes · Atlas",
  description:
    "Conecta cualquier agente IA vía MCP (Streamable HTTP) o API REST v1 para consultar el catálogo de Atlas, registrar viajes/cumbres y subir fotos.",
};

export default function DevelopersPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://atlas-log.vercel.app";

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--paper, #faf8f1)",
        color: "var(--ink, #18342d)",
        fontFamily: "'DM Sans', sans-serif",
        padding: "2.5rem 1.25rem 4rem",
      }}
    >
      <div
        style={{
          maxWidth: "820px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "2.25rem",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--line, #dce4da)",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
              color: "var(--pine, #245f52)",
              fontWeight: 700,
              fontSize: "1.1rem",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 52 L36 12 L48 32 Z" fill="#245f52" />
              <path d="M24 60 L44 26 L60 52 Z" fill="#5b3a8c" opacity="0.85" />
            </svg>
            Atlas
          </Link>
          <Link
            href="/"
            className="button button--outline"
            style={{
              textDecoration: "none",
              fontSize: "0.85rem",
              padding: "0.4rem 0.9rem",
            }}
          >
            Volver al mapa
          </Link>
        </div>

        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "2.15rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            color: "var(--ink, #18342d)",
          }}
        >
          API &amp; MCP para Agentes IA
        </h1>
        <p
          style={{
            fontSize: "0.98rem",
            color: "var(--muted, #62716b)",
            marginBottom: "2rem",
            lineHeight: 1.6,
          }}
        >
          Conecta asistentes como Claude Desktop, Cursor, Antigravity o cualquier cliente HTTP a
          Atlas para buscar los 196 países, 47 picos provinciales y experiencias, registrar visitas y
          subir fotografías directamente (optimizadas automáticamente en Cloudflare R2).
        </p>

        <DevelopersClient initialOrigin={baseUrl} />
      </div>
    </main>
  );
}
