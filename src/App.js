import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { getRoute } from "./lib";
import Asistente from "./views/Asistente";
import Operador from "./views/Operador";
import Pantalla from "./views/Pantalla";
import Admin from "./views/Admin";
import { Logo, Spinner, Vacio } from "./components/UI";
import Icon from "./components/Icons";

export default function App() {
  const [{ view, slug }] = useState(getRoute);
  const [evento, setEvento] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(view !== "admin" && view !== "inicio");
  const eventoIdRef = useRef(null);

  const fetchFotos = useCallback(async (eventoId) => {
    if (!eventoId) return;
    const { data } = await supabase
      .from("fotos").select("*").eq("evento_id", eventoId)
      .order("created_at", { ascending: false });
    setFotos(data || []);
  }, []);

  const handleUpdateEvento = useCallback((nuevo) => setEvento(nuevo), []);

  /* Carga el evento a partir del slug de la URL */
  useEffect(() => {
    if (view === "admin" || view === "inicio") return;
    if (!slug) { setCargando(false); return; }

    const init = async () => {
      const { data: ev } = await supabase
        .from("eventos").select("*").eq("slug", slug).maybeSingle();
      if (ev) {
        setEvento(ev);
        eventoIdRef.current = ev.id;
        await fetchFotos(ev.id);
      }
      setCargando(false);
    };
    init();
  }, [view, slug, fetchFotos]);

  /* Actualización en vivo: polling en la pantalla LED, realtime en el resto */
  useEffect(() => {
    if (!evento) return;
    const id = evento.id;

    if (view === "pantalla") {
      const t = setInterval(() => fetchFotos(id), 15000);
      return () => clearInterval(t);
    }

    if (view === "operador") {
      const canal = supabase
        .channel(`fotos-${id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "fotos", filter: `evento_id=eq.${id}` },
          () => fetchFotos(id))
        .subscribe();
      return () => supabase.removeChannel(canal);
    }
  }, [evento, view, fetchFotos]);

  /* --- Panel admin: no depende de slug --- */
  if (view === "admin") return <Admin />;

  /* --- Aterrizaje: alguien entró a la raíz sin evento --- */
  if (view === "inicio") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <Logo size={30} />
          </div>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "var(--tint-cyan)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
          }}>
            <Icon.QR size={26} color="var(--cyan)" />
          </div>
          <h1 className="display" style={{ fontSize: 22, marginBottom: 12 }}>
            Escanea el código de tu evento
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
            Cada evento tiene su propio código QR. Búscalo en la pantalla LED o pregúntale al organizador.
          </p>
          <a href="https://nexoled.cl" target="_blank" rel="noreferrer"
            className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Conocer NexoLED
          </a>
        </div>
      </div>
    );
  }

  /* --- Falta el slug en la URL --- */
  if (!slug) {
    return (
      <Vacio
        titulo="Falta el evento en la dirección"
        detalle="Este enlace necesita el nombre del evento al final. Escanea el QR del evento."
      />
    );
  }

  if (cargando) return <Spinner texto="Cargando evento" />;

  if (view === "pantalla") return <Pantalla evento={evento} fotos={fotos} />;

  if (view === "operador") {
    return (
      <Operador
        evento={evento}
        fotos={fotos}
        onRefreshFotos={() => fetchFotos(eventoIdRef.current)}
        onUpdateEvento={handleUpdateEvento}
      />
    );
  }

  return <Asistente evento={evento} />;
}
