import { useEffect } from "react";
import Icon from "./Icons";

/* Logo NexoPix: imagen cromada azul y rubí (public/nexopix_logo.png, fondo transparente).
   Proporción real del PNG recortado: 1200 x 233. */
const LOGO_URL = "/nexopix_logo.png";
const LOGO_PROPORCION = 1200 / 233;

/* Logo de tamaño fijo (se usa en pantallas que aún no tienen referencia).
   El ancho se calcula con la proporción real, así nunca se deforma. */
export function Logo({ size = 22, sub = true }) {
  const alto = Math.round(size * 2);
  const ancho = Math.round(alto * LOGO_PROPORCION);
  return (
    <div style={{
      lineHeight: 1, display: "inline-flex", flexDirection: "column",
      alignItems: "center", flexShrink: 0,
    }}>
      <img
        src={LOGO_URL}
        alt="NexoPix"
        width={ancho}
        height={alto}
        style={{
          display: "block", width: ancho, maxWidth: "80vw", height: "auto",
          aspectRatio: `${LOGO_PROPORCION}`, objectFit: "contain",
        }}
      />
      {sub && (
        <div className="eyebrow" style={{ fontSize: 9, marginTop: 4, color: "var(--text-faint)" }}>
          Wide
        </div>
      )}
    </div>
  );
}

/* Logo + título: el logo mide exactamente lo mismo de ancho que el título.
   Truco: la caja del logo tiene ancho 0 (no empuja) y ancho mínimo 100%,
   así el ancho lo define solo el texto y el logo se estira a ese ancho. */
export function LogoTitulo({ titulo, centrado = false }) {
  return (
    <div style={{
      display: "inline-flex", flexDirection: "column",
      alignItems: centrado ? "center" : "flex-start", maxWidth: "100%",
    }}>
      <div style={{ width: 0, minWidth: "100%" }}>
        <img
          src={LOGO_URL}
          alt="NexoPix"
          style={{
            display: "block", width: "100%", height: "auto",
            aspectRatio: `${LOGO_PROPORCION}`, objectFit: "contain",
          }}
        />
      </div>
      <div className="eyebrow" style={{ marginTop: 8, whiteSpace: "nowrap" }}>
        {titulo}
      </div>
    </div>
  );
}

export function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast" role="status">{msg}</div>;
}

export function Stat({ label, value, color }) {
  return (
    <div style={{
      background: "var(--bg)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "14px 10px", textAlign: "center",
    }}>
      <div className="display" style={{ fontSize: 24, color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export function Spinner({ texto }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 18,
    }}>
      <div className="spinner" />
      {texto && <div className="eyebrow">{texto}</div>}
    </div>
  );
}

/* Pantalla de estado vacío / error, con acción opcional */
export function Vacio({ icono = "alert", titulo, detalle, children }) {
  const Ico = icono === "alert" ? Icon.Alert : icono === "inbox" ? Icon.Inbox : Icon.Screen;
  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 14,
    }}>
      <Ico size={34} color="var(--text-faint)" />
      <div className="display" style={{ fontSize: 19 }}>{titulo}</div>
      {detalle && (
        <div style={{ color: "var(--text-dim)", fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>
          {detalle}
        </div>
      )}
      {children}
    </div>
  );
}

export function Modal({ titulo, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "85vh", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span className="eyebrow">{titulo}</span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <Icon.X size={18} color="var(--text-dim)" />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}