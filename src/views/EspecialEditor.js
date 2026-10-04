// src/views/EspecialEditor.js
//
// Configurador del "Especial de la noche" de un evento.
// Dirección: /admin/especial/<slug>  (requiere sesión de admin)
//
// El tipo de contenido (Grilla / Especial + grilla / Solo Especial) se elige
// en el Admin principal. Aquí solo se configura:
// - Nombre de la tarjeta que ve el invitado
// - Prompt del Especial (lo lee solo el servidor)
// - Hasta 2 imágenes de referencia. A la IA se mandan en orden:
//   1) selfie del invitado, 2) referencia 1, 3) referencia 2

import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icons";
import { Logo, Toast, Vacio } from "../components/UI";

const NOMBRES_CONTENIDO = {
  especial_grilla: "Especial + grilla",
  solo_especial: "Solo Especial",
};

const MAX_NOMBRE = 40;
const MAX_MB = 8;
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"];
const EMOJI_BRILLO = "\u{2728}";

const nombreDesdeUrl = (url) => (url || "").split("/fotos/")[1] || null;
const irAlAdmin = () => { window.location.href = "/admin"; };

export default function EspecialEditor({ slug }) {
  const [verificando, setVerificando] = useState(true);
  const [conSesion, setConSesion] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [evento, setEvento] = useState(null);
  const [nombre, setNombre] = useState("");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState([null, null]);
  const [originales, setOriginales] = useState([null, null]);
  const [subiendo, setSubiendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios] = useState(false);
  const [toast, setToast] = useState(null);
  const inputRef1 = useRef(null);
  const inputRef2 = useRef(null);

  /* ---------- Sesión de admin ---------- */
  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setConSesion(!!data?.session);
      setVerificando(false);
    });
    return () => { activo = false; };
  }, []);

  /* ---------- Cargar el evento ---------- */
  useEffect(() => {
    if (verificando) return;
    if (!conSesion || !slug) { setCargando(false); return; }
    (async () => {
      const { data } = await supabase
        .from("eventos")
        .select("id, nombre, slug, contenido_ia, especial_label, especial_prompt, especial_ref_url, especial_ref_url_2")
        .eq("slug", slug)
        .maybeSingle();
      if (data) {
        setEvento(data);
        setNombre(data.especial_label || "");
        setPrompt(data.especial_prompt || "");
        const lista = [data.especial_ref_url || null, data.especial_ref_url_2 || null];
        setRefs(lista);
        setOriginales(lista);
      }
      setCargando(false);
    })();
  }, [verificando, conSesion, slug]);

  /* ---------- Imágenes de referencia ---------- */
  const borrarSiEsNueva = async (indice) => {
    const actual = refs[indice];
    if (actual && actual !== originales[indice]) {
      const n = nombreDesdeUrl(actual);
      if (n) await supabase.storage.from("fotos").remove([n]);
    }
  };

  const subirReferencia = async (indice, file) => {
    if (!file || !evento) return;
    if (!TIPOS_PERMITIDOS.includes(file.type)) { setToast("Usa una imagen PNG, JPG o WEBP"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setToast(`La imagen pesa más de ${MAX_MB} MB`); return; }
    setSubiendo(indice);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const nombreArchivo = `especial_${evento.id}_${indice + 1}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("fotos")
        .upload(nombreArchivo, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("fotos").getPublicUrl(nombreArchivo);
      await borrarSiEsNueva(indice);
      setRefs((prev) => {
        const copia = [...prev];
        copia[indice] = data.publicUrl;
        return copia;
      });
      setCambios(true);
    } catch {
      setToast("No se pudo subir la imagen");
    } finally {
      setSubiendo(null);
    }
  };

  const quitarReferencia = async (indice) => {
    await borrarSiEsNueva(indice);
    setRefs((prev) => {
      const copia = [...prev];
      copia[indice] = null;
      return copia;
    });
    setCambios(true);
  };

  /* ---------- Guardar ---------- */
  const guardar = async () => {
    if (!evento) return;
    if (!nombre.trim()) { setToast("Ponle un nombre a la tarjeta del Especial"); return; }
    if (!prompt.trim()) { setToast("Escribe el prompt del Especial"); return; }

    // Si solo hay una referencia, queda siempre como la primera.
    const lista = refs.filter(Boolean);
    const r1 = lista[0] || null;
    const r2 = lista[1] || null;

    setGuardando(true);
    const { error } = await supabase
      .from("eventos")
      .update({
        especial_label: nombre.trim(),
        especial_prompt: prompt.trim(),
        especial_ref_url: r1,
        especial_ref_url_2: r2,
      })
      .eq("id", evento.id);

    if (error) {
      setGuardando(false);
      setToast("No se pudo guardar");
      return;
    }

    // Borra del almacenamiento las referencias antiguas que se reemplazaron.
    const aBorrar = originales
      .filter((u) => u && u !== r1 && u !== r2)
      .map(nombreDesdeUrl)
      .filter(Boolean);
    if (aBorrar.length) await supabase.storage.from("fotos").remove(aBorrar);

    setRefs([r1, r2]);
    setOriginales([r1, r2]);
    setCambios(false);
    setGuardando(false);
    setToast("Especial guardado");
  };

  /* ---------- Pantallas de carga y acceso ---------- */
  if (verificando || cargando) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-dim)", fontSize: 14 }}>Cargando...</div>
      </div>
    );
  }

  if (!conSesion) {
    return (
      <Centro>
        <Logo size={22} />
        <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, margin: "18px 0" }}>
          Necesitas iniciar sesión en el Admin para configurar el Especial.
        </p>
        <button className="btn btn-primary btn-block" onClick={irAlAdmin}>Ir al Admin</button>
      </Centro>
    );
  }

  if (!evento) {
    return <Vacio titulo="Evento no encontrado" detalle="Revisa la dirección o vuelve al Admin." />;
  }

  const contenido = evento.contenido_ia || "grilla";

  if (contenido === "grilla") {
    return (
      <Centro>
        <Logo size={22} />
        <div className="display" style={{ fontSize: 18, marginTop: 16 }}>{evento.nombre}</div>
        <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, margin: "14px 0 18px" }}>
          Este evento no tiene Especial activado. Actívalo desde el Admin, en "Contenido IA".
        </p>
        <button className="btn btn-primary btn-block" onClick={irAlAdmin}>Volver al Admin</button>
      </Centro>
    );
  }

  return (
    <div style={{ padding: "20px 16px 110px", maxWidth: 820, margin: "0 auto" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      <input ref={inputRef1} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
        onChange={(e) => { subirReferencia(0, e.target.files[0]); e.target.value = ""; }} />
      <input ref={inputRef2} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
        onChange={(e) => { subirReferencia(1, e.target.files[0]); e.target.value = ""; }} />

      {/* Cabecera */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <Logo size={22} />
          <div className="eyebrow" style={{ marginTop: 10, color: "var(--magenta)" }}>Especial de la noche</div>
          <div className="display" style={{ fontSize: 20, marginTop: 4 }}>{evento.nombre}</div>
          <span className="chip" style={{ marginTop: 8, color: "#fff", borderColor: "var(--magenta)", background: "rgba(224,64,251,0.18)" }}>
            {NOMBRES_CONTENIDO[contenido] || contenido}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={irAlAdmin}>Volver al Admin</button>
      </header>

      {/* 1. Nombre de la tarjeta */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label">Nombre de la tarjeta</div>
        <input className="input" value={nombre} maxLength={MAX_NOMBRE}
          placeholder="Halloween 2026"
          onChange={(e) => { setNombre(e.target.value); setCambios(true); }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
            Es lo que ve el invitado en la tarjeta destacada. {nombre.length}/{MAX_NOMBRE}
          </div>
          <div style={{
            padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff",
            border: "1px solid var(--magenta)",
            background: "linear-gradient(135deg, rgba(224,64,251,0.25), rgba(0,229,255,0.15))",
            boxShadow: "0 0 18px rgba(224,64,251,0.3)",
          }}>
            {EMOJI_BRILLO} {nombre.trim() || "Nombre del Especial"}
          </div>
        </div>
      </div>

      {/* 2. Prompt */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label">Prompt</div>
        <textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setCambios(true); }}
          rows={14}
          placeholder="Pega aquí el prompt del Especial"
          style={{
            width: "100%", resize: "vertical", padding: 12, borderRadius: "var(--r-sm)",
            background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
            fontFamily: "monospace", fontSize: 13, lineHeight: 1.55, boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.6 }}>
          {prompt.length.toLocaleString("es-CL")} caracteres. Orden de imágenes que recibe la IA:
          1) selfie del invitado, 2) referencia 1, 3) referencia 2. Siempre se genera con GPT Image.
        </div>
      </div>

      {/* 3. Referencias */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="label">Imágenes de referencia (opcional, hasta 2)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {[0, 1].map((i) => (
            <RanuraReferencia
              key={i}
              titulo={i === 0 ? "Referencia 1 (2ª imagen)" : "Referencia 2 (3ª imagen)"}
              url={refs[i]}
              subiendo={subiendo === i}
              onSubir={() => (i === 0 ? inputRef1 : inputRef2).current?.click()}
              onQuitar={() => quitarReferencia(i)}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.6 }}>
          PNG, JPG o WEBP, máximo {MAX_MB} MB. Los PNG mantienen su transparencia (ideal para textos o logos).
        </div>
      </div>

      {/* Barra de guardar */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 16px",
        background: "rgba(10,10,15,0.92)", borderTop: "1px solid var(--border)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, fontSize: 12, color: cambios ? "var(--warn, #f5a623)" : "var(--text-faint)" }}>
            {cambios ? "Tienes cambios sin guardar" : "Todo guardado"}
          </div>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando || subiendo !== null}>
            <Icon.Check size={15} /> {guardando ? "Guardando..." : "Guardar Especial"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Tarjeta centrada para avisos. */
function Centro({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

/* Ranura para una imagen de referencia, con vista previa. */
function RanuraReferencia({ titulo, url, subiendo, onSubir, onQuitar }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>{titulo}</div>
      {url ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
          <div style={{
            height: 180, display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: "#1a1a24",
            backgroundImage: "linear-gradient(45deg, #22222e 25%, transparent 25%), linear-gradient(-45deg, #22222e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #22222e 75%), linear-gradient(-45deg, transparent 75%, #22222e 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
          }}>
            <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", gap: 8, padding: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onSubir} disabled={subiendo}>
              {subiendo ? "Subiendo..." : "Cambiar"}
            </button>
            <button className="btn btn-danger btn-sm" onClick={onQuitar} disabled={subiendo}>
              <Icon.Trash size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onSubir} disabled={subiendo} style={{
          width: "100%", height: 180, cursor: subiendo ? "wait" : "pointer",
          border: "1px dashed var(--border-strong)", borderRadius: "var(--r-sm)",
          background: "var(--bg)", color: "var(--text-dim)", fontFamily: "var(--font-body)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Icon.Plus size={22} />
          <span style={{ fontSize: 13 }}>{subiendo ? "Subiendo..." : "Subir imagen"}</span>
        </button>
      )}
    </div>
  );
}