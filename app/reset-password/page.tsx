"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [linkError, setLinkError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isExchanging, setIsExchanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Parse URL hash for errors (e.g. if the link expired) or PKCE code in query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const hash = window.location.hash;
    if (hash && hash.includes("error=access_denied")) {
      if (hash.includes("otp_expired")) {
        setLinkError("El enlace de recuperación ha caducado o ya ha sido utilizado. Por favor, solicita uno nuevo.");
      } else {
        setLinkError("Ocurrió un error con el enlace de recuperación.");
      }
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && supabase) {
      setIsExchanging(true);
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exchangeError }) => {
          if (cancelled) return;
          if (exchangeError) {
            setLinkError("El enlace de recuperación es inválido o ha caducado. Por favor, solicita uno nuevo.");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLinkError("No se pudo verificar el enlace de recuperación.");
          }
        })
        .finally(() => {
          if (!cancelled) setIsExchanging(false);
        });
    } else if (supabase) {
      // If no code and no access_token in hash, check if there is an active session
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (!data?.session && !hash.includes("access_token")) {
          setLinkError("No se ha detectado ninguna sesión de recuperación activa. Por favor, solicita un enlace nuevo.");
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || isExchanging) return;

    setBusy(true);
    setMessage("");
    setSubmitError("");

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setSubmitError(error.message);
      } else {
        setMessage("Contraseña actualizada correctamente. Redirigiendo...");
        redirectTimerRef.current = setTimeout(() => {
          router.push("/");
        }, 2000);
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <section className="auth-dialog" style={{ width: "100%", maxWidth: "400px", margin: "0 auto", position: "relative" }}>
        <span className="eyebrow">RECUPERACIÓN</span>
        <h2>Nueva contraseña</h2>

        {linkError ? (
          <div style={{ marginTop: "1rem" }}>
            <p className="form-message" style={{ color: "var(--red, #e74c3c)", marginBottom: "1rem" }}>{linkError}</p>
            <Link href="/" className="button button--green button--wide" style={{ textAlign: "center", display: "block" }}>
              Volver al inicio
            </Link>
          </div>
        ) : isExchanging ? (
          <p className="form-message" style={{ marginTop: "1rem" }}>Verificando enlace de recuperación...</p>
        ) : message ? (
          <div style={{ marginTop: "1rem" }}>
            <p className="form-message" style={{ color: "var(--green, #2ecc71)" }}>{message}</p>
          </div>
        ) : (
          <>
            <p>Introduce tu nueva contraseña para acceder de nuevo a tu cuenta.</p>
            <form onSubmit={submit}>
              <label>
                Contraseña
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </label>

              {submitError && (
                <p className="form-message" style={{ color: "var(--red, #e74c3c)", marginBottom: "0.75rem" }}>
                  {submitError}
                </p>
              )}

              <button className="button button--green button--wide" disabled={busy}>
                {busy ? "Guardando..." : "Guardar contraseña"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
