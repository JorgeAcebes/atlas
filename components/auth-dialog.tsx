"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function AuthDialog({ onClose, initialTab = "register" }: { onClose: () => void; initialTab?: "login" | "register" }) {
  const [isRegister, setIsRegister] = useState(initialTab === "register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    lockScroll();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      unlockScroll();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Supabase no está configurado. Verifica las variables de entorno.");
      return;
    }
    setBusy(true);
    setMessage("");

    function handleError(error: any) {
      let errText = "";
      if (typeof error?.message === "string") errText = error.message;
      else if (error?.message) errText = JSON.stringify(error.message);
      else errText = JSON.stringify(error);

      if (errText === "{}" || !errText) {
        errText = "Error interno al enviar el correo (revisa la configuración SMTP/Resend).";
      }

      const errCode = error?.code || "";
      if (errText.toLowerCase().includes("failed to fetch")) {
        setMessage(
          "Error de conexión con Supabase. Comprueba tu conexión a internet o si tienes un bloqueador de anuncios activo."
        );
      } else if (errText.toLowerCase().includes("rate limit") || errCode === "over_email_send_rate_limit") {
        setMessage("Límite de correos alcanzado en Supabase. Espera unos minutos antes de volver a intentarlo.");
      } else if (errText.toLowerCase().includes("invalid login credentials")) {
        setMessage("Correo o contraseña incorrectos.");
      } else {
        setMessage(errText);
      }
    }

    try {
      if (!isRegister) {
        // Direct sign-in
        let loginEmail = email;

        // Si no tiene '@' o solo lo tiene al principio, asumimos que puede ser un nombre de usuario
        if (!email.includes("@") || email.indexOf("@") === 0) {
          const cleanUsername = email.replace(/^@/, "").toLowerCase();
          try {
            const res = await fetch("/api/auth/username-login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: cleanUsername, password }),
            });
            const data = await res.json();
            setBusy(false);
            if (!res.ok) {
              handleError({ message: data.error || "Correo o contraseña incorrectos." });
              return;
            }
            if (data.session) {
              await supabase.auth.setSession(data.session);
              onClose();
              return;
            }
          } catch (err: any) {
            setBusy(false);
            handleError(err);
            return;
          }
        } else {
          const result = await supabase.auth.signInWithPassword({ email: loginEmail, password });
          setBusy(false);
          if (result.error) {
            handleError(result.error);
          } else {
            onClose();
          }
        }
      } else {
        // Sign-up attempt
        const result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
        });

        if (result.error) {
          const errText = (result.error.message || "").toLowerCase();
          // If user already exists, try signing in automatically
          if (errText.includes("already registered") || errText.includes("already been registered") || errText.includes("user already registered")) {
            const signInResult = await supabase.auth.signInWithPassword({ email, password });
            setBusy(false);
            if (signInResult.error) {
              handleError(signInResult.error);
            } else {
              onClose();
            }
          } else {
            setBusy(false);
            handleError(result.error);
          }
        } else if (result.data?.user?.identities?.length === 0) {
          // Supabase returns an empty identities array when the user already exists (email confirmation disabled)
          const signInResult = await supabase.auth.signInWithPassword({ email, password });
          setBusy(false);
          if (signInResult.error) {
            handleError(signInResult.error);
          } else {
            onClose();
          }
        } else if (result.data?.session) {
          // Auto-confirmed: user is already logged in
          setBusy(false);
          onClose();
        } else {
          setBusy(false);
          setMessage("¡Cuenta creada! Revisa tu correo para confirmarla (revisa la carpeta de Spam si no te llega).");
        }
      }
    } catch (err: unknown) {
      setBusy(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessage(errMsg);
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setResetBusy(true);
    setResetMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
    });
    setResetBusy(false);
    if (error) {
      setResetMessage(error.message);
    } else {
      setResetMessage("Te hemos enviado un correo con las instrucciones para restablecer tu contraseña.");
    }
  }

  if (isForgotPassword) {
    return (
      <div className="modal-backdrop" onWheel={(e) => e.stopPropagation()} role="presentation">
        <section
          className="auth-dialog"
          role="dialog"
          aria-modal="true"
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
        >
          <button className="icon-button" aria-label="Cerrar" onClick={() => setIsForgotPassword(false)}>
            <IconClose />
          </button>
          <span className="eyebrow">RECUPERAR CONTRASEÑA</span>
          <h2>He olvidado la contraseña</h2>
          <p>Introduce tu correo y te enviaremos un enlace para restablecerla.</p>
          <form onSubmit={submitReset} className="auth-form">
            <label>
              Correo electrónico
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
              />
            </label>
            {resetMessage && <p className="form-message">{resetMessage}</p>}
            <button className="button button--green button--wide" disabled={resetBusy}>
              {resetBusy ? "Enviando…" : "Enviar enlace"}
            </button>
          </form>
          <button
            className="link-button"
            onClick={() => {
              setIsForgotPassword(false);
              setResetMessage("");
            }}
          >
            Volver
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onWheel={(e) => e.stopPropagation()} role="presentation">
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Acceso a Atlas"
        style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
      >
        <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
          <IconClose />
        </button>
        <h2>{isRegister ? "Crea tu cuenta" : "Bienvenido de vuelta"}</h2>
        <form onSubmit={submit} className="auth-form">
          <label>
            {isRegister ? "Correo electrónico" : "Correo electrónico o @usuario"}
            <input
              type={isRegister ? "email" : "text"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isRegister ? "nombre@ejemplo.com" : "nombre@ejemplo.com o @usuario"}
            />
          </label>
          <label>
            Contraseña
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={{ width: "100%", paddingRight: "40px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  display: "flex",
                }}
                aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {!isRegister && (
              <div style={{ marginTop: "6px", textAlign: "right" }}>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline"
                  }}
                >
                  He olvidado la contraseña
                </button>
              </div>
            )}
          </label>
          {message && <p className="form-message">{message}</p>}
          {isRegister && (
            <p
              style={{
                fontSize: "0.78rem",
                lineHeight: 1.4,
                color: "var(--muted)",
                margin: "-2px 0 -8px",
                textAlign: "center",
              }}
            >
              Al registrarte aceptas los{" "}
              <Link
                href="/terminos"
                target="_blank"
                style={{ color: "var(--pine)", textDecoration: "underline" }}
              >
                Términos y Condiciones
              </Link>{" "}
              y la{" "}
              <Link
                href="/privacidad"
                target="_blank"
                style={{ color: "var(--pine)", textDecoration: "underline" }}
              >
                Política de Privacidad
              </Link>
              .
            </p>
          )}
          <button className="button button--green button--wide" disabled={busy}>
            {busy
              ? "Un momento…"
              : isRegister
                ? "Crear mi cuenta"
                : "Entrar"}
          </button>
        </form>
        <button
          className="link-button"
          onClick={() => {
            setIsRegister(!isRegister);
            setMessage("");
          }}
        >
          {isRegister ? "Ya tengo una cuenta" : "Quiero crear una cuenta"}
        </button>
      </section>
    </div>
  );
}
