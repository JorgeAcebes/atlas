import Link from "next/link";

export default function PrivacidadPage() {
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
          Política de Privacidad y Cookies
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
              1. Responsable del Tratamiento
            </h2>
            <p>
              El responsable del tratamiento de los datos personales recogidos en{" "}
              <strong>Atlas</strong> es <strong>Jorge Acebes</strong>, en calidad
              de creador y desarrollador independiente de la plataforma.
            </p>
            <p>
              Para cualquier cuestión relativa a la protección de tus datos o
              para ejercer tus derechos, puedes escribir directamente a:{" "}
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

          <div>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.35rem",
                color: "var(--pine, #245f52)",
                marginBottom: "0.5rem",
              }}
            >
              2. Datos Personales que Recopilamos y Finalidad
            </h2>
            <p>
              Recopilamos únicamente los datos necesarios para ofrecerte las
              funcionalidades de seguimiento cartográfico:
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                <strong>Datos de cuenta:</strong> Correo electrónico y contraseña
                (cifrada mediante algoritmos de un solo sentido) para gestionar
                tu autenticación y permitirte acceder a tus datos desde cualquier
                dispositivo.
              </li>
              <li>
                <strong>Datos de perfil:</strong> Nombre de usuario (@usuario) y
                foto de avatar opcional.
              </li>
              <li>
                <strong>Datos de actividad y progreso:</strong> Cumbres, países y
                experiencias registradas, fechas de ascensión, notas personales y
                fotografías que decidas subir voluntariamente.
              </li>
              <li>
                <strong>Ubicación y Geolocalización:</strong> Atlas <strong>no</strong> rastrea tu ubicación en tiempo real mediante GPS ni en segundo plano. Únicamente vinculamos a tu cuenta las ubicaciones (países, cumbres, experiencias) que tú marques de forma explícita y manual como completadas.
              </li>
            </ul>
            <p style={{ marginTop: "0.5rem" }}>
              <strong>Finalidad:</strong> Permitirte registrar y visualizar tu
              progreso geográfico personal y, si activas la opción de perfil
              público, compartir tus actividades con otros usuarios en el feed de
              la comunidad y el ranking.
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
              3. Base Jurídica y Conservación de Datos
            </h2>
            <p>
              La base legal para el tratamiento de tus datos es la{" "}
              <strong>ejecución del servicio</strong> y tu{" "}
              <strong>consentimiento expreso</strong> al registrarte.
            </p>
            <p>
              Tus datos se conservarán mientras mantengas activa tu cuenta. Si
              decides eliminarla, todos tus registros, fotos y perfil serán
              borrados de manera definitiva de nuestros sistemas.
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
              4. Destinatarios y Encargados del Tratamiento
            </h2>
            <p>
              Tus datos no se ceden ni venden a terceros bajo ningún concepto.
              Para operar la infraestructura técnica utilizamos proveedores de
              primer nivel que cumplen con las garantías del RGPD:
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                <strong>Supabase Inc.</strong>: Servicio de base de datos
                PostgreSQL y autenticación de usuarios.
              </li>
              <li>
                <strong>Cloudflare Inc.</strong>: Almacenamiento de archivos y
                contenido multimedia (Cloudflare R2) y red de entrega de contenido (CDN).
              </li>
              <li>
                <strong>Vercel Inc.</strong>: Alojamiento y despliegue de la
                aplicación web.
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
              5. Política de Cookies y Almacenamiento Local
            </h2>
            <p>
              En Atlas apostamos por una experiencia limpia y respetuosa con tu
              privacidad:
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                <strong>Cero cookies de rastreo publicitario:</strong> No
                utilizamos cookies de terceros para perfilado comercial ni redes
                publicitarias.
              </li>
              <li>
                <strong>Cookies y almacenamiento técnico:</strong> Únicamente
                utilizamos almacenamiento en el navegador (cookies de sesión y{" "}
                <code>localStorage</code>) estrictamente necesario para mantener
                iniciada tu sesión de forma segura y recordar tus preferencias
                de interfaz (como la modalidad de mapa activa).
              </li>
            </ul>
            <p style={{ marginTop: "0.5rem" }}>
              De acuerdo con el artículo 22.2 de la Ley de Servicios de la
              Sociedad de la Información (LSSI-CE) y las directrices de la
              Agencia Española de Protección de Datos (AEPD), el uso de cookies
              estrictamente técnicas y necesarias no requiere el consentimiento
              previo ni banners invasivos.
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
              6. Tus Derechos (Acceso, Rectificación y Supresión)
            </h2>
            <p>
              En virtud del RGPD y la LOPDGDD, tienes derecho a acceder a tus
              datos personales, solicitar su rectificación, oponerte a su
              tratamiento o pedir su supresión total.
            </p>
            <p>
              Puedes ejercer estos derechos y gestionar tu cuenta directamente
              desde la aplicación:
            </p>
            <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
              <li>
                <strong>Eliminación de cuenta (automática e inmediata):</strong> Puedes darte de baja en cualquier momento de forma autónoma.
                Para ello, abre los Ajustes de Perfil, pulsa en{" "}
                <em>Eliminar cuenta</em> y confirma la acción escribiendo tu usuario. Esta acción borrará
                de forma permanente e irreversible todo tu progreso, fotografías y perfil de nuestros sistemas.
                Por motivos de seguridad y para garantizar la titularidad de la cuenta, <strong>no se procesarán solicitudes de baja enviadas por correo electrónico</strong>; la baja debe realizarse exclusivamente a través de este mecanismo integrado en la aplicación.
              </li>
            </ul>
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
              href="/terminos"
              style={{ color: "var(--pine, #245f52)", textDecoration: "none" }}
            >
              Términos y Condiciones
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
