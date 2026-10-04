import { useEffect } from "react";
import Icon from "./Icons";

/* Logo NexoPix: imagen cromada azul y rubí (public/nexopix_logo.webp).
   La mezcla "screen" hace desaparecer el fondo negro de la imagen
   sobre los fondos oscuros de la app. */
const LOGO_URL = "/nexopix_logo.png";
const LOGO_PROPORCION = 1200 / 287;

export function Logo({ size = 22, sub = true }) {
  const alto = Math.round(size * 1.7);
  const ancho = Math.round(alto * LOGO_PROPORCION);
  return (
    <div style={{ lineHeight: 1, display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <img
        src={LOGO_URL}
        alt="NexoPix"
        width={ancho}
        height={alto}
        style={{ display: "block", width: ancho, height: alto, mixBlendMode: "screen" }}
      />
      {sub && (
        <div className="eyebrow" style={{ fontSize: 9, marginTop: 2, color: "var(--text-faint)" }}>
          Wide
        </div>
      )}
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