import { useState, useRef } from "react";
import { supabase } from "../supabase";
import { comprimirImagen } from "../lib";
import Icon from "../components/Icons";
import { Vacio } from "../components/UI";

// ---------------------------------------------------------------------------
// Catálogo de modos IA. Por ahora solo nombre — cuando tengamos las fotos de
// portada de cada modo, se agrega un campo `imagen` acá y se usa en el grid.
// El id debe ser EXACTAMENTE igual al key usado en api/generarFoto.js
// ---------------------------------------------------------------------------
const MODOS_IA = [
  { id: "game_of_thrones", nombre: "Game of Thrones" },
  { id: "peaky_style", nombre: "Peaky Style" },
  { id: "breaking_bad", nombre: "Breaking Bad" },
  { id: "viejitos", nombre: "Viejitos" },
  { id: "harry_magic", nombre: "Harry Magic" },
  { id: "super_hero", nombre: "Super Hero" },
  { id: "grease", nombre: "Grease" },
  { id: "jurassic_park", nombre: "Jurassic Park" },
  { id: "simpsons", nombre: "Simpsons" },
  { id: "princesa_disney", nombre: "Princesa Disney" },
  { id: "disco_70s", nombre: "70s Disco" },
  { id: "barbie", nombre: "Barbie" },
];

// Este es un "modo especial": en vez de disparar la generación directo,
// abre el subcatálogo de 4 jugadores.
const MODO_FUTBOL_FAN = { id: "futbol_fan", nombre: "Fútbol Fan" };

const SUBMODOS_FUTBOL = [
  { id: "futbol_fan_1", nombre: "Jugador 1" },
  { id: "futbol_fan_2", nombre: "Jugador 2" },
  { id: "futbol_fan_3", nombre: "Jugador 3" },
  { id: "futbol_fan_4", nombre: "Jugador 4" },
];

export default function Asistente({ evento }) {
  const [step, setStep] = useState("subir");
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [autorizada, setAutorizada] = useState(true);

  // --- Estado de Funny Photo IA ---
  const [generandoIA, setGenerandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");
  const [iaLista, setIaLista] = useState(false);
  const [urlResultadoIA, setUrlResultadoIA] = useState(null);
  const [fotoIdIA, setFotoIdIA] = useState(null);
  const [intentosIA, setIntentosIA] = useState(0);
  const [confirmandoIA, setConfirmandoIA] = useState(false);
  const [iaConfirmada, setIaConfirmada] = useState(false);
  const [modoSeleccionado, setModoSeleccionado] = useState(null);
  const MAX_INTENTOS_IA = 2;

  const fileRef = useRef();
  const fileRefIA = useRef();
  // Guarda qué modo se eligió en el catálogo justo antes de abrir el
  // selector de foto — se usa apenas el usuario elige la imagen.
  const modoParaSubidaRef = useRef(null);

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

  // --- Catálogo: abre el subcatálogo de Fútbol Fan, o dispara el selector
  // de foto directo para cualquier otro modo ---
  const elegirModo = (modoId) => {
    if (modoId === "futbol_fan") {
      setStep("catalogo-futbol");
      return;
    }
    modoParaSubidaRef.current = modoId;
    fileRefIA.current?.click();
  };

  const elegirSubmodoFutbol = (modoId) => {
    modoParaSubidaRef.current = modoId;
    fileRefIA.current?.click();
  };

  // --- Handler: el usuario ya eligió modo (en el catálogo) y ahora elige
  // la foto — dispara la generación con ese modo ---
  const tomarArchivoIA = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen. Elige una foto.");
      return;
    }
    const modo = modoParaSubidaRef.current;
    if (!modo) return;

    setError("");
    setFile(f);
    setIntentosIA(0);
    setIaConfirmada(false);
    setModoSeleccionado(modo);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setStep("ia");
      generarConIA(f, modo);
    };
    reader.readAsDataURL(f);
  };

  // --- Sube la foto original a Supabase y llama a api/generarFoto.js
  // con el modo elegido en el catálogo ---
  const generarConIA = async (fileParaIA, modo) => {
    const fileAUsar = fileParaIA || file;
    const modoAUsar = modo || modoSeleccionado;
    if (!fileAUsar || !evento || !modoAUsar) return;
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
          modo: modoAUsar,
          eventoId: evento.id,
        }),
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(resultado?.error || "Error generando la foto con IA");
      }

      setUrlResultadoIA(resultado?.foto?.url || null);
      setFotoIdIA(resultado?.foto?.id || null);
      setIntentosIA((n) => n + 1);
      setIaLista(true);
    } catch (err) {
      setErrorIA(err.message || "No se pudo generar la foto con IA. Intenta de nuevo.");
    } finally {
      setGenerandoIA(false);
    }
  };

  // --- Botón "Probar otra vez": genera de nuevo con la misma foto y modo ---
  const intentarDeNuevo = () => {
    if (intentosIA >= MAX_INTENTOS_IA) return;
    setIaLista(false);
    generarConIA(file, modoSeleccionado);
  };

  // --- Botón "Usar esta foto": recién aquí se vuelve visible para el operador ---
  const confirmarFotoIA = async () => {
    if (!fotoIdIA) return;
    setConfirmandoIA(true);
    try {
      const { error: errUpdate } = await supabase
        .from("fotos")
        .update({ status: "pending" })
        .eq("id", fotoIdIA);
      if (errUpdate) throw errUpdate;
      setIaConfirmada(true);
    } catch {
      setErrorIA("No se pudo confirmar la foto. Intenta de nuevo.");
    } finally {
      setConfirmandoIA(false);
    }
  };

  const reiniciar = () => {
    setStep("subir"); setPreview(null); setFile(null);
    setAutorizada(true); setError("");
    setGenerandoIA(false); setErrorIA(""); setIaLista(false);
    setUrlResultadoIA(null); setFotoIdIA(null); setIntentosIA(0);
    setConfirmandoIA(false); setIaConfirmada(false); setModoSeleccionado(null);
    modoParaSubidaRef.current = null;
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

        {/* Input oculto y compartido para TODOS los modos IA — se dispara
            desde elegirModo() / elegirSubmodoFutbol() con .click() */}
        <input
          ref={fileRefIA}
          type="file"
          accept="image/*"
          onChange={(e) => tomarArchivoIA(e.target.files[0])}
          style={{ display: "none" }}
        />

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

            {/* Botón que lleva al catálogo de modos IA — solo si el admin
                dejó la IA activada para este evento. */}
            {evento?.ia_habilitada !== false && (
              <div style={{
                marginTop: 26, paddingTop: 20,
                borderTop: "1px dashed var(--border)", textAlign: "center",
              }}>
                <button
                  className="btn btn-ghost btn-block"
                  onClick={() => setStep("catalogo")}
                >
                  FUNphoto IA
                </button>
              </div>
            )}

            <Banner />
          </div>
        )}

        {step === "catalogo" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>FUNphoto IA</div>
              <h2 className="display" style={{ fontSize: 20 }}>Elige un modo</h2>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
            }}>
              {MODOS_IA.map((modo) => (
                <button
                  key={modo.id}
                  onClick={() => elegirModo(modo.id)}
                  className="card"
                  style={{
                    aspectRatio: "1 / 1", display: "flex", alignItems: "center",
                    justifyContent: "center", textAlign: "center", padding: 12,
                    cursor: "pointer", border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <span className="display" style={{ fontSize: 14 }}>{modo.nombre}</span>
                </button>
              ))}

              {/* Fútbol Fan: lleva al subcatálogo, no dispara generación directo */}
              <button
                onClick={() => elegirModo(MODO_FUTBOL_FAN.id)}
                className="card"
                style={{
                  aspectRatio: "1 / 1", display: "flex", alignItems: "center",
                  justifyContent: "center", textAlign: "center", padding: 12,
                  cursor: "pointer", border: "1px solid var(--cyan)",
                  background: "var(--surface)",
                }}
              >
                <span className="display" style={{ fontSize: 14 }}>{MODO_FUTBOL_FAN.nombre}</span>
              </button>
            </div>

            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 20 }}
              onClick={() => setStep("subir")}
            >
              Volver
            </button>

            <Banner />
          </div>
        )}

        {step === "catalogo-futbol" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Fútbol Fan</div>
              <h2 className="display" style={{ fontSize: 20 }}>Elige tu compañero de selfie</h2>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
            }}>
              {SUBMODOS_FUTBOL.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => elegirSubmodoFutbol(sub.id)}
                  className="card"
                  style={{
                    aspectRatio: "1 / 1", display: "flex", alignItems: "center",
                    justifyContent: "center", textAlign: "center", padding: 12,
                    cursor: "pointer", border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <span className="display" style={{ fontSize: 14 }}>{sub.nombre}</span>
                </button>
              ))}
            </div>

            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 20 }}
              onClick={() => setStep("catalogo")}
            >
              Volver al catálogo
            </button>

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
                    width: "100%", maxWidth: 280, margin: "0 auto 18px",
                    borderRadius: "var(--r-md)", aspectRatio: "9/16",
                    objectFit: "cover", display: "block",
                    border: "1px solid var(--border)",
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
                    width: "100%", maxWidth: 280, margin: "0 auto 18px",
                    borderRadius: "var(--r-md)", aspectRatio: "9/16",
                    objectFit: "cover", display: "block",
                    border: "1px solid var(--cyan)",
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

              {!generandoIA && iaLista && !iaConfirmada && (
                <>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>
                    ¿Te gusta el resultado?
                  </h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>
                    Intento {intentosIA} de {MAX_INTENTOS_IA}
                  </p>
                  {intentosIA >= MAX_INTENTOS_IA && (
                    <p style={{ color: "var(--warn, #f5a623)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 }}>
                      Ya usaste tus {MAX_INTENTOS_IA} intentos. Elige esta foto o vuelve a "Subir foto" normal.
                    </p>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: intentosIA >= MAX_INTENTOS_IA ? 0 : 16 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                      onClick={intentarDeNuevo}
                      disabled={intentosIA >= MAX_INTENTOS_IA || confirmandoIA}
                    >
                      Probar otra vez
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={confirmarFotoIA}
                      disabled={confirmandoIA}
                    >
                      {confirmandoIA ? "Confirmando…" : "Usar esta foto"}
                    </button>
                  </div>

                  <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={reiniciar}>
                    Cambiar de foto
                  </button>
                </>
              )}

              {!generandoIA && iaLista && iaConfirmada && (
                <>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%", background: "var(--tint-cyan)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 18px",
                  }}>
                    <Icon.Check size={26} color="var(--cyan)" />
                  </div>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>
                    ¡Listo!
                  </h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                    El operador la revisa y, si la aprueba, aparece en la pantalla.
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