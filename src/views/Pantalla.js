import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase";
import { urlsDe } from "../lib";
import { Logo, Vacio } from "../components/UI";

// Tiempos en pantalla (milisegundos).
const DURACION_FOTO = 5000;
const DURACION_QR = 6000; // 20% más que antes

// Con 5 fotos o más, el QR aparece cada 5 fotos.
// Con menos de 5, aparece después de que pasan todas.
const FOTOS_ENTRE_QR = 5;

// Tamaño de la ventana: sirve para saber si la pantalla es vertical (pendón LED)
// u horizontal (TV/proyector) y acomodar el QR.
function useVentana() {
  const leer = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(leer);
  useEffect(() => {
    const f = () => setV(leer());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return v;
}

export default function Pantalla({ evento: eventoInicial, fotos }) {
  const [evento, setEvento] = useState(eventoInicial);
  const aprobadas = fotos.filter((f) => f.status === "approved");
  const total = aprobadas.length;
  const urlSubida = evento ? urlsDe(evento.slug).subir : "";

  const { w, h } = useVentana();
  const vertical = h > w;

  /* Polling: cada 15s App.js ya refresca las fotos.
     Acá además consultamos el estado del evento para detectar cierre en tiempo real */
  useEffect(() => {
    if (!eventoInicial?.id) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("eventos").select("evento_cerrado, nombre, slug")
        .eq("id", eventoInicial.id).single();
      if (data) setEvento(data);
    }, 15000);
    return () => clearInterval(t);
  }, [eventoInicial?.id]);

  /* ---------- Secuencia: fotos y QR ---------- */
  const [fotoIdx, setFotoIdx] = useState(0);
  const [mostrandoQR, setMostrandoQR] = useState(false);
  const fotosDesdeQRRef = useRef(0);

  // Cada cuántas fotos aparece el QR: todas si hay menos de 5, si no cada 5.
  const cadaCuantas = Math.min(Math.max(total, 1), FOTOS_ENTRE_QR);

  useEffect(() => {
    if (total === 0) return undefined; // sin fotos, el QR queda fijo
    const duracion = mostrandoQR ? DURACION_QR : DURACION_FOTO;
    const t = setTimeout(() => {
      if (mostrandoQR) {
        setMostrandoQR(false);
        setFotoIdx((i) => (i + 1) % total);
        return;
      }
      fotosDesdeQRRef.current += 1;
      if (fotosDesdeQRRef.current >= cadaCuantas) {
        fotosDesdeQRRef.current = 0;
        setMostrandoQR(true);
      } else {
        setFotoIdx((i) => (i + 1) % total);
      }
    }, duracion);
    return () => clearTimeout(t);
  }, [mostrandoQR, fotoIdx, total, cadaCuantas]);

  if (!evento) {
    return <Vacio titulo="Evento no encontrado" detalle="Revisa la dirección de la pantalla." />;
  }

  /* Evento cerrado: pantalla de cierre limpia */
  if (evento.evento_cerrado) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#000",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 24,
      }}>
        <Logo size={22} sub={false} />
        <div style={{ textAlign: "center" }}>
          <div className="display" style={{ fontSize: 28, color: "var(--text-dim)", marginBottom: 10 }}>
            {evento.nombre}
          </div>
          <div className="eyebrow" style={{ color: "var(--text-faint)" }}>
            Evento finalizado
          </div>
        </div>
      </div>
    );
  }

  const verQR = total === 0 || mostrandoQR;
  const fotoActual = total > 0 ? aprobadas[fotoIdx % total] : null;

  /* ---------- Medidas del QR ----------
     Horizontal: igual que antes (QR a la izquierda, texto a la derecha).
     Vertical: QR arriba ocupando casi todo el ancho, texto abajo centrado. */
  const margenV = Math.round(w * 0.05);          // margen lateral en vertical
  const bordeQR = vertical ? Math.round(w * 0.04) : 18;
  const tamQR = vertical
    ? Math.max(120, Math.min(w - margenV * 2 - bordeQR * 2, Math.round(h * 0.5)))
    : 230;
  const escala = vertical ? Math.min(1, w / 600) : 1; // achica textos en pantallas angostas

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      {/* Barra superior */}
      <div style={{
        height: 54, flexShrink: 0, background: "#000",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: vertical ? "0 10px" : "0 24px", gap: 8,
      }}>
        <Logo size={16} sub={false} />
        {!vertical && (
          <div className="display" style={{ fontSize: 13, color: "var(--text-dim)", letterSpacing: "0.02em" }}>
            {evento.nombre}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot dot-live" />
          <span className="eyebrow" style={{ fontSize: 10 }}>
            {total} foto{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", overflow: "hidden",
      }}>
        {verQR ? (
          <div className="rise" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: vertical ? "column" : "row",
            gap: vertical ? Math.round(h * 0.03) : 56,
            width: "100%", height: "100%",
            padding: vertical ? margenV : 40,
            boxSizing: "border-box",
          }}>
            <div style={{
              background: "#fff", padding: bordeQR, borderRadius: vertical ? 12 : 18,
              boxShadow: "0 0 60px rgba(var(--cyan-rgb),0.25)", flexShrink: 0,
            }}>
              <QRCodeSVG value={urlSubida} size={tamQR} bgColor="#ffffff" fgColor="#0a0a0f" level="H" />
            </div>
            <div style={{ textAlign: vertical ? "center" : "left", maxWidth: "100%" }}>
              {/* Logo grande con el degradado de la marca: es el protagonista */}
              <div style={{
                marginBottom: Math.round(20 * escala),
                display: "flex", justifyContent: vertical ? "center" : "flex-start",
              }}>
                <Logo size={Math.round(44 * escala)} sub={false} degradado />
              </div>
              {/* Misma fuente del logo, en blanco y un poco más chica */}
              <div className="display" style={{
                fontSize: Math.round(40 * escala), lineHeight: 1.05,
                marginBottom: Math.round(16 * escala), color: "var(--text)",
              }}>
                Sube tu foto
              </div>
              <div style={{ fontSize: Math.max(13, Math.round(19 * escala)), color: "var(--text-dim)", lineHeight: 1.5 }}>
                Escanea el código y aparece en esta pantalla.
              </div>
              {vertical && (
                <div className="display" style={{
                  marginTop: Math.round(h * 0.03),
                  fontSize: Math.max(12, Math.round(18 * escala)),
                  color: "var(--text-dim)", lineHeight: 1.25,
                }}>
                  {evento.nombre}
                </div>
              )}
            </div>
          </div>
        ) : (
          <img
            key={`${fotoActual?.id}-${fotoIdx}`}
            src={fotoActual?.url}
            alt=""
            className="rise"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        )}
      </div>
    </div>
  );
}