import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y Condiciones · Atlas",
  description: "Condiciones de uso del servicio, propiedad de contenido y normativa de Atlas.",
};

export default function TerminosPage() {
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
          maxWidth: "760px",
          margin: "0 auto",
        }}
      >
        {/* Cabecera / Volver */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "2.5rem",
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

        {/* Título */}
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "2.25rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            color: "var(--ink, #18342d)",
          }}
        >
          Términos y Condiciones
        </h1>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--muted, #62716b)",
            marginBottom: "2rem",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          Última actualización: 8 de octubre de 2026
        </p>

        {/* Contenido */}
        <section
          style={{
            lineHeight: 1.7,
            fontSize: "0.98rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.75rem",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              1. Información General y Objeto
            </h2>
            <p>
              Bienvenido a <strong>Atlas</strong> (accesible en{" "}
              <a
                href="https://atlas-log.vercel.app"
                style={{ color: "var(--pine, #245f52)" }}
              >
                atlas-log.vercel.app
              </a>
              ). Atlas es una plataforma cartográfica y social independiente
              desarrollada por Jorge Acebes, diseñada para que montañeros y
              viajeros puedan registrar sus ascensos a techos provinciales, sus
              visitas a los países del mundo y experiencias de aventura.
            </p>
            <p>
              El uso de esta aplicación implica la aceptación plena de los
              presentes Términos y Condiciones. Si no estás de acuerdo con alguna
              de sus cláusulas, te rogamos que no utilices la plataforma.
            </p>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              2. Registro, Cuenta de Usuario y Seguridad
            </h2>
            <p>
              Para guardar tu progreso y sincronizar tus cumbres entre
              dispositivos es necesario registrar una cuenta mediante correo
              electrónico y contraseña.
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                Eres responsable de mantener la confidencialidad de tus
                credenciales.
              </li>
              <li>
                Te comprometes a proporcionar información veraz en el registro y
                a no suplantar la identidad de otras personas mediante tu nombre
                de usuario.
              </li>
              <li>
                Puedes darte de baja y eliminar de forma inmediata e irreversible
                tu cuenta y todos tus datos asociados en cualquier momento desde
                los ajustes de perfil. Esta acción es autónoma y debe realizarse obligatoriamente a través de la aplicación (no se tramitan bajas por correo electrónico).
              </li>
            </ul>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              3. Contenido Subido por el Usuario y Fotografías
            </h2>
            <p>
              Al registrar actividades, puedes subir notas personales y
              fotografías:
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                Mantienes todos los derechos de propiedad intelectual sobre las
                fotografías y textos que subas.
              </li>
              <li>
                Garantizas que dispones de los derechos para compartir dichas
                imágenes y que no vulneran derechos de imagen de terceros ni
                contienen material ilícito o difamatorio.
              </li>
              <li>
                Si tienes el perfil público activado, autorizas la visualización
                de tus publicaciones en el feed comunitario de la plataforma.
                Puedes cambiar la visibilidad de tu perfil a privado en cualquier
                momento desde los ajustes.
              </li>
            </ul>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              4. Exención de Responsabilidad en Actividades de Montaña
            </h2>
            <p>
              Atlas es una herramienta puramente informativa y de seguimiento
              personal. Las altitudes, descripciones, coordenadas y rutas son de
              carácter divulgativo:
            </p>
            <p>
              La práctica del montañismo y senderismo entraña riesgos
              inherentes. El usuario es el único responsable de evaluar las
              condiciones meteorológicas, su preparación física, equipamiento y
              la dificultad técnica de cualquier cumbre antes de emprender una
              ascensión. Atlas y su creador no se hacen responsables de ningún
              accidente o daño derivado de actividades al aire libre.
            </p>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              5. Exención de Responsabilidad en Experiencias de Aventura y Viajes
            </h2>
            <p>
              El modo Experiencias de Atlas recopila retos, actividades al aire
              libre, hitos geográficos y viajes singulares en diversos países
              (tales como safaris, buceo, expediciones o travesías). Toda la
              información facilitada tiene un propósito exclusivamente
              divulgativo, lúdico y de seguimiento personal:
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                <strong>Ausencia de organización o intermediación:</strong> Atlas no
                opera como agencia de viajes, touroperador ni empresa de turismo
                activo, ni organiza, comercializa, supervisa ni asegura ninguna de
                las experiencias catalogadas.
              </li>
              <li>
                <strong>Responsabilidad del usuario:</strong> La realización de
                actividades de aventura implica riesgos propios del entorno o de
                zonas remotas. El usuario asume íntegramente la responsabilidad de
                evaluar sus condiciones físicas y técnicas, contratar empresas o
                guías autorizados y dotarse del equipamiento homologado y los
                seguros de viaje y rescate pertinentes.
              </li>
              <li>
                <strong>Requisitos legales y locales:</strong> Es obligación
                exclusiva del usuario consultar y acatar las leyes locales,
                permisos de acceso a parques o espacios protegidos y normativas
                sanitarias vigentes en cada territorio.
              </li>
              <li>
                <strong>Exoneración total:</strong> Atlas y su creador no asumen
                ninguna responsabilidad por accidentes, daños físicos o materiales,
                extravíos, cancelaciones o contingencias de cualquier naturaleza
                que pudieran suscitarse con ocasión de dichas actividades.
              </li>
            </ul>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              6. Disponibilidad del Servicio y Modificación de los Términos
            </h2>
            <p>
              Atlas es un proyecto personal e independiente. Hacemos todo lo posible por mantener el servicio operativo y tus datos seguros de forma continua, pero no podemos garantizar una disponibilidad ininterrumpida ni estar libres de errores.
            </p>
            <p>
              Nos reservamos el derecho a modificar estos Términos y Condiciones en cualquier momento. En caso de cambios sustanciales que afecten a tus derechos o a la privacidad de tus datos, te informaremos a través de la propia aplicación o mediante el correo electrónico asociado a tu cuenta. El uso continuado de Atlas tras dichos cambios implicará tu aceptación de los mismos.
            </p>
          </div>

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              7. Contacto
            </h2>
            <p>
              Para cualquier consulta, reporte de error o duda relativa a estos
              términos, puedes contactar directamente a través de:{" "}
              <a
                href="mailto:atlas.maplog@gmail.com"
                style={{
                  color: "var(--pine, #245f52)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                atlas.maplog@gmail.com
              </a>
              .
            </p>
          </div>
        </section>

        {/* Pie */}
        <div
          style={{
            marginTop: "3rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--line, #dce4da)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            fontSize: "0.85rem",
            color: "var(--muted, #62716b)",
          }}
        >
          <div>&copy; {new Date().getFullYear()} Atlas · Jorge Acebes</div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <Link
              href="/privacidad"
              style={{ color: "var(--pine, #245f52)", textDecoration: "none" }}
            >
              Política de Privacidad
            </Link>
            <a
              href="mailto:atlas.maplog@gmail.com"
              style={{ color: "var(--pine, #245f52)", textDecoration: "none" }}
            >
              Contacto
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
