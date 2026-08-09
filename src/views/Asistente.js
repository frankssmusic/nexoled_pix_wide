import { useState, useRef } from "react";
import { supabase } from "../supabase";
import { comprimirImagen } from "../lib";
import Icon from "../components/Icons";
import { Vacio } from "../components/UI";

export default function Asistente({ evento }) {
  const [step, setStep] = useState("subir");
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [autorizada, setAutorizada] = useState(true);

  // --- Estado nuevo, solo para la prueba de Funny Photo IA ---
  const [generandoIA, setGenerandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");
  const [iaLista, setIaLista] = useState(false);
  const [urlResultadoIA, setUrlResultadoIA] = useState(null);

  const fileRef = useRef();
  const fileRefIA = useRef();

  const mensaje = evento?.mensaje_subida || "Subir foto";

  const tomarArchivo = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen. Elige una foto.");
      return;
    }
    setError("");
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => { setPreview(e.target.result); setStep("revisar"); };
    reader.readAsDataURL(f);
  };

  const enviar = async () => {
    if (!file || !evento) return;
    setEnviando(true);
    setError("");
    try {
      // Verificar en tiempo real que el evento sigue abierto
      const { data: evActual } = await supabase.from("eventos").select("evento_cerrado").eq("id", evento.id).single();
      if (evActual?.evento_cerrado) {
        setError("Este evento ya cerró. No se pueden subir más fotos.");
        setEnviando(false);
        return;
      }
      const comprimida = await comprimirImagen(file);
      const filename = `${evento.id}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("fotos").upload(filename, comprimida, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("fotos").getPublicUrl(filename);
      const { error: dbErr } = await supabase.from("fotos").insert({
        evento_id: evento.id,
        url: urlData.publicUrl,
        status: "pending",
        autorizada,
      });
      if (dbErr) throw dbErr;
      setStep("enviada");
    } catch {
      setError("No se pudo enviar la foto. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  // --- Handler nuevo: botón "FUNphoto IA" en la pantalla principal ---
  // Toma la foto igual que el flujo normal, pero en vez de ir a "revisar",
  // dispara directo la generación con IA.
  const tomarArchivoIA = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen. Elige una foto.");
      return;
    }
    setError("");
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setStep("ia");
      probarGameOfThrones(f);
    };
    reader.readAsDataURL(f);
  };

  // --- Función nueva, solo para la prueba de Funny Photo IA ---
  // Sube la foto original a Supabase (para tener una URL pública que WaveSpeed
  // pueda leer) y luego llama a api/generarFoto.js con el modo Game of Thrones.
  const probarGameOfThrones = async (fileParaIA) => {
    const fileAUsar = fileParaIA || file;
    if (!fileAUsar || !evento) return;
    setGenerandoIA(true);
    setErrorIA("");
    setIaLista(false);
    setUrlResultadoIA(null);
    try {
      const comprimida = await comprimirImagen(fileAUsar);
      const filenameOriginal = `original_${evento.id}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("fotos")
        .upload(filenameOriginal, comprimida, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: urlOriginal } = supabase.storage
        .from("fotos")
        .getPublicUrl(filenameOriginal);

      const respuesta = await fetch("/api/generarFoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotoUrl: urlOriginal.publicUrl,
          modo: "game_of_thrones",
          eventoId: evento.id,
        }),
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(resultado?.error || "Error generando la foto con IA");
      }

      setUrlResultadoIA(resultado?.foto?.url || null);
      setIaLista(true);
    } catch (err) {
      setErrorIA(err.message || "No se pudo generar la foto con IA. Intenta de nuevo.");
    } finally {
      setGenerandoIA(false);
    }
  };

  const reiniciar = () => {
    setStep("subir"); setPreview(null); setFile(null);
    setAutorizada(true); setError("");
    setGenerandoIA(false); setErrorIA(""); setIaLista(false);
    setUrlResultadoIA(null);
  };

  if (!evento) {
    return (
      <Vacio
        titulo="Evento no encontrado"
        detalle="Revisa el enlace o escanea de nuevo el código QR del evento."
      />
    );
  }

  if (evento.evento_cerrado) {
    return (
      <Vacio
        icono="inbox"
        titulo="Este evento ya terminó"
        detalle={`"${evento.nombre}" cerró la recepción de fotos. Gracias por participar.`}
      />
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "20px 16px 40px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Cabecera del evento */}
        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>NexoLED presenta</div>
          <h1 className="display" style={{ fontSize: 26, lineHeight: 1.15 }}>{evento.nombre}</h1>
        </header>

        {step === "subir" && (
          <div className="rise">
            {/* Tótem: la pantalla LED en miniatura, es el gesto de subida */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <label
                style={{
                  position: "relative", width: "min(72vw, 260px)", aspectRatio: "0.45 / 1",
                  borderRadius: "14px 14px 3px 3px", overflow: "hidden", cursor: "pointer",
                  border: "1px solid rgba(0,229,255,0.4)",
                  background: "linear-gradient(180deg, #0d0d16, #14141f)",
                  boxShadow: "0 0 40px rgba(0,229,255,0.12), inset 0 0 40px rgba(0,229,255,0.04)",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 14, padding: 20, textAlign: "center",
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => tomarArchivo(e.target.files[0])}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                />
                <Icon.Camera size={38} color="var(--cyan)" />
                <div className="display" style={{ fontSize: 17, lineHeight: 1.25 }}>{mensaje}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>JPG · PNG · HEIC</div>
              </label>
              {/* Patas del tótem */}
              <div style={{ display: "flex", gap: 26 }}>
                {[0, 1].map((i) => (
                  <div key={i} style={{
                    width: 7, height: 18,
                    background: "linear-gradient(180deg, rgba(0,229,255,0.3), rgba(0,229,255,0.08))",
                    borderRadius: "0 0 3px 3px",
                  }} />
                ))}
              </div>
            </div>

            <p style={{
              textAlign: "center", color: "var(--text-dim)", fontSize: 14,
              marginTop: 22, lineHeight: 1.6,
            }}>
              Tu foto pasa por revisión y aparece en la pantalla del evento.
            </p>

            {error && (
              <div className="chip chip-danger" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
                {error}
              </div>
            )}

            {/* ---- Prueba: botón FUNphoto IA en pantalla principal ---- */}
            {/* Sin diseño final todavía — solo para validar el flujo completo */}
            <div style={{
              marginTop: 26, paddingTop: 20,
              borderTop: "1px dashed var(--border)", textAlign: "center",
            }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                Zona de prueba
              </div>
              <label className="btn btn-ghost btn-block" style={{ cursor: "pointer" }}>
                FUNphoto IA — Game of Thrones
                <input
                  ref={fileRefIA}
                  type="file"
                  accept="image/*"
                  onChange={(e) => tomarArchivoIA(e.target.files[0])}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <Banner />
          </div>
        )}

        {step === "ia" && (
          <div className="rise">
            <div className="card" style={{ textAlign: "center" }}>
              {/* Mientras genera, muestra la foto original que subió el invitado */}
              {(generandoIA || errorIA) && preview && (
                <img
                  src={preview}
                  alt="Tu foto"
                  style={{
                    width: "100%", borderRadius: "var(--r-md)", aspectRatio: "4/3",
                    objectFit: "cover", marginBottom: 18, border: "1px solid var(--border)",
                    opacity: generandoIA ? 0.5 : 1,
                  }}
                />
              )}

              {/* Cuando está lista, muestra el RESULTADO de la IA, no la foto original */}
              {!generandoIA && iaLista && urlResultadoIA && (
                <img
                  src={urlResultadoIA}
                  alt="Tu foto transformada con IA"
                  style={{
                    width: "100%", borderRadius: "var(--r-md)", aspectRatio: "4/3",
                    objectFit: "cover", marginBottom: 18, border: "1px solid var(--cyan)",
                  }}
                />
              )}

              {generandoIA && (
                <>
                  <div className="display" style={{ fontSize: 17, marginBottom: 8 }}>
                    Generando con IA…
                  </div>
                  <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6 }}>
                    Puede tardar hasta 45 segundos. No cierres esta pantalla.
                  </p>
                </>
              )}

              {!generandoIA && iaLista && (
                <>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>
                    ¡Aquí está tu foto!
                  </h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                    Ya quedó registrada. El operador la revisa y aparece en la pantalla.
                  </p>
                  <button className="btn btn-ghost btn-block" onClick={reiniciar}>
                    Probar otra foto
                  </button>
                </>
              )}

              {!generandoIA && errorIA && (
                <>
                  <div className="chip chip-danger" style={{ marginBottom: 18, width: "100%", justifyContent: "center" }}>
                    {errorIA}
                  </div>
                  <button className="btn btn-ghost btn-block" onClick={reiniciar}>
                    Volver a intentar
                  </button>
                </>
              )}
            </div>
            <Banner />
          </div>
        )}

        {step === "revisar" && (
          <div className="rise">
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Revisa tu foto</div>
              <img
                src={preview}
                alt="Vista previa de tu foto"
                style={{
                  width: "100%", borderRadius: "var(--r-md)", aspectRatio: "4/3",
                  objectFit: "cover", marginBottom: 18, border: "1px solid var(--border)",
                }}
              />

              <button
                onClick={() => setAutorizada(!autorizada)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "4px 0",
                  marginBottom: 18, background: "none", border: "none", cursor: "pointer",
                  textAlign: "left", width: "100%",
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: autorizada ? "1px solid var(--cyan)" : "1px solid var(--border-strong)",
                  background: autorizada ? "var(--cyan)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {autorizada && <Icon.Check size={14} color="#0a0a0f" />}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  Autorizo a NexoLED a usar esta foto con fines publicitarios
                </span>
              </button>

              {error && (
                <div className="chip chip-danger" style={{ marginBottom: 14, width: "100%", justifyContent: "center" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reiniciar} disabled={enviando}>
                  Cambiar
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={enviar} disabled={enviando}>
                  {enviando ? "Enviando…" : "Enviar foto"}
                </button>
              </div>
            </div>
            <Banner />
          </div>
        )}

        {step === "enviada" && (
          <div className="rise">
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: "var(--tint-cyan)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 18px",
              }}>
                <Icon.Check size={26} color="var(--cyan)" />
              </div>
              <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>Foto enviada</h2>
              <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                El operador la revisa y, si la aprueba, aparece en la pantalla.
              </p>
              <button className="btn btn-ghost btn-block" onClick={reiniciar}>Enviar otra foto</button>
            </div>
            <Banner />
          </div>
        )}
      </div>
    </div>
  );
}

function Banner() {
  return (
    <a
      href="https://nexoled.cl"
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: "none", display: "block", marginTop: 22 }}
    >
      <div style={{
        padding: 18, background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", textAlign: "center",
      }}>
        <div className="display" style={{ fontSize: 15, marginBottom: 6 }}>
          ¿Quieres esto en tu evento?
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
          Pantallas LED para bodas, cumpleaños y eventos en Punta Arenas.
        </div>
        <span className="btn btn-primary btn-sm">Ver NexoLED</span>
      </div>
    </a>
  );
}