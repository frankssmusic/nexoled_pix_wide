import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase";
import { urlsDe } from "../lib";
import { Logo, Vacio } from "../components/UI";

export default function Pantalla({ evento: eventoInicial, fotos }) {
  const [evento, setEvento] = useState(eventoInicial);
  const aprobadas = fotos.filter((f) => f.status === "approved");
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

  /* Intercala el QR: si hay pocas fotos, tras cada una; si hay muchas, cada 6 */
  const slides = (() => {
    if (aprobadas.length === 0) return [{ type: "qr" }];
    if (aprobadas.length < 6) {
      return aprobadas.flatMap((f) => [{ type: "foto", data: f }, { type: "qr" }]);
    }
    return aprobadas.reduce((acc, f, i) => {
      acc.push({ type: "foto", data: f });
      if ((i + 1) % 6 === 0) acc.push({ type: "qr" });
      return acc;
    }, []);
  })();

  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    if (current >= slides.length && slides.length > 0) setCurrent(0);
  }, [slides.length, current]);

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
            {aprobadas.length} foto{aprobadas.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", overflow: "hidden",
      }}>
        {slides[current]?.type === "qr" ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 56, width: "100%", height: "100%", padding: 40,
          }}>
            <div style={{
              background: "#fff", padding: 18, borderRadius: 18,
              boxShadow: "0 0 60px rgba(0,229,255,0.25)", flexShrink: 0,
            }}>
              <QRCodeSVG value={urlSubida} size={230} bgColor="#ffffff" fgColor="#0a0a0f" level="H" />
            </div>
            <div style={{ textAlign: "left" }}>
              <div className="display grad-text" style={{ fontSize: 46, lineHeight: 1.05, marginBottom: 14 }}>
                Sube tu foto
              </div>
              <div style={{ fontSize: 19, color: "var(--text-dim)", lineHeight: 1.5 }}>
                Escanea el código y aparece en esta pantalla.
              </div>
            </div>
          </div>
        ) : (
          <img
            key={current}
            src={slides[current]?.data?.url}
            alt=""
            className="rise"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        )}
      </div>
    </div>
  );
}
