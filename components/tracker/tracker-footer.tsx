"use client";

import React from "react";
import { IconGithub, IconLinkedin } from "./tracker-icons";

export function TrackerFooter({ isPeaks }: { isPeaks: boolean }) {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-left">
          Atlas · Datos {isPeaks ? "de altitudes según " : "según "}
          <a
            href={
              isPeaks
                ? "https://es.wikipedia.org/wiki/Anexo:Monta%C3%B1as_m%C3%A1s_altas_y_prominentes_de_las_provincias_espa%C3%B1olas"
                : "https://es.wikipedia.org/wiki/Anexo:Pa%C3%ADses"
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Wikipedia
          </a>
        </div>

        <div className="footer-center">
          Desarrollado por Jorge Acebes
          <a
            href="https://github.com/JorgeAcebes"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <IconGithub />
          </a>
          <a
            href="https://www.linkedin.com/in/jorge-acebes"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <IconLinkedin />
          </a>
        </div>

        <div className="footer-right">
          Mapa ©{" "}
          <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-disclaimer">
          Toda la información personal y datos de progreso se procesan de forma segura en los
          servidores de{" "}
          <a href="https://supabase.com/" target="_blank" rel="noopener noreferrer">
            Supabase
          </a>
          , y el contenido fotográfico y multimedia se almacena en{" "}
          <a href="https://www.cloudflare.com/" target="_blank" rel="noopener noreferrer">
            Cloudflare
          </a>
          .<br />
          &copy; {new Date().getFullYear()} Jorge Acebes. Todos los derechos reservados. El uso de
          esta web es únicamente con fines de entretenimiento y seguimiento personal.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "1rem",
            marginTop: "0.75rem",
            fontSize: "0.78rem",
            flexWrap: "wrap",
          }}
        >
          <a href="/terminos" style={{ color: "var(--muted)", textDecoration: "underline" }}>
            Términos y Condiciones
          </a>
          <span style={{ color: "var(--line)", opacity: 0.8 }}>•</span>
          <a href="/privacidad" style={{ color: "var(--muted)", textDecoration: "underline" }}>
            Privacidad y Cookies
          </a>
          <span style={{ color: "var(--line)", opacity: 0.8 }}>•</span>
          <a
            href="mailto:atlas.maplog@gmail.com"
            style={{ color: "var(--muted)", textDecoration: "underline" }}
          >
            Contacto
          </a>
        </div>
      </div>
    </footer>
  );
}
