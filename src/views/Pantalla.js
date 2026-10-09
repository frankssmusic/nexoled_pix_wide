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

export default function Pantalla({ evento: eventoInicial, fotos }) {
  const [evento, setEvento] = useState(eventoInicial);
  const aprobadas = fotos.filter((f) => f.status === "approved");
  const total = aprobadas.length;
  const urlSubida = evento ? urlsDe(evento.slug).subir : "";

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
        padding: "0 24px",
      }}>
        <Logo size={16} sub={false} />
        <div className="display" style={{ fontSize: 13, color: "var(--text-dim)", letterSpacing: "0.02em" }}>
          {evento.nombre}
        </div>
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
            gap: 56, width: "100%", height: "100%", padding: 40,
          }}>
            <div style={{
              background: "#fff", padding: 18, borderRadius: 18,
              boxShadow: "0 0 60px rgba(var(--cyan-rgb),0.25)", flexShrink: 0,
            }}>
              <QRCodeSVG value={urlSubida} size={230} bgColor="#ffffff" fgColor="#0a0a0f" level="H" />
            </div>
            <div style={{ textAlign: "left" }}>
              {/* Logo grande con el degradado de la marca: es el protagonista */}
              <div style={{ marginBottom: 20 }}>
                <Logo size={44} sub={false} degradado />
              </div>
              {/* Misma fuente del logo, en blanco y un poco más chica */}
              <div className="display" style={{
                fontSize: 40, lineHeight: 1.05, marginBottom: 16, color: "var(--text)",
              }}>
                Sube tu foto
              </div>
              <div style={{ fontSize: 19, color: "var(--text-dim)", lineHeight: 1.5 }}>
                Escanea el código y aparece en esta pantalla.
              </div>
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