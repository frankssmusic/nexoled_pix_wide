import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabase";
import { comprimirImagen } from "../lib";
import Icon from "../components/Icons";
import { Vacio } from "../components/UI";
import MiniJuego from "../components/MiniJuego";

const MODOS_IA = [
  { id: "game_of_thrones", nombre: "Game of Thrones" },
  { id: "peaky_style", nombre: "Peaky Style" },
  { id: "breaking_bad", nombre: "Breaking Bad" },
  { id: "viejitos", nombre: "Viejitos" },
  { id: "harry_magic", nombre: "Harry Magic" },
  { id: "super_hero", nombre: "Super Hero" },
  { id: "old_school", nombre: "Old School" },
  { id: "jurassic_park", nombre: "Jurassic Park" },
  { id: "simpsons", nombre: "Simpsons" },
  { id: "princesa_disney", nombre: "Princesa Disney" },
  { id: "disco_70s", nombre: "70s Disco" },
  { id: "barbie", nombre: "Barbie" },
];

// Bloque DIVERTIDOS: filtros tipo Snapchat, solo visibles en eventos premium.
// El servidor (api/generarFoto.js) también los bloquea si el evento no es premium.
const MODOS_DIVERTIDOS = [
  { id: "ojos_saltones", nombre: "Ojos Saltones" },
  { id: "maquillaje_tia", nombre: "Maquillaje de Tía" },
  { id: "chimuela_cachetona", nombre: "Chimuela Cachetona" },
  { id: "cambio_genero", nombre: "Al Revés" },
  { id: "cara_pescado", nombre: "Cara de Pescado" },
  { id: "cara_bebe", nombre: "Cara de Bebé" },
  { id: "cabezones", nombre: "Cabezones" },
  { id: "cara_aplastada", nombre: "Cara Aplastada" },
];

const esModoDivertido = (modoId) => MODOS_DIVERTIDOS.some((m) => m.id === modoId);

// Mensajes que van rotando mientras la IA genera la foto.
const MENSAJES_GENERANDO = [
  "Aplicando el estilo a tu foto",
  "Ajustando los detalles",
  "Cuidando que te reconozcas",
  "Dando los últimos toques",
  "Algunos modos tardan un poco más, ya casi",
];

// Errores donde reintentar no sirve (cuota, plan, IA apagada, evento cerrado).
const ERRORES_NO_REINTENTABLES = ["límite", "plan premium", "no está disponible", "cerró"];

const MENSAJE_ERROR_REINTENTABLE =
  "La IA no pudo generar esta foto esta vez. Toca \"Intentar de nuevo\" y se creará otra versión.";

// Espera máxima: 90 consultas x 3 segundos = 270 segundos.
const MAX_CONSULTAS = 90;

const MODO_FUTBOL_FAN = { id: "futbol_fan", nombre: "Fútbol Fan" };

const SUBMODOS_FUTBOL = [
  { id: "futbol_fan_1", nombre: "Países Bajos" },
  { id: "futbol_fan_2", nombre: "Francia" },
  { id: "futbol_fan_3", nombre: "Portugal" },
  { id: "futbol_fan_4", nombre: "Argentina" },
];

// Consejos del instructivo. Los emojis van como códigos para que no se
// corrompan al copiar el archivo.
const CONSEJOS_INSTRUCTIVO = [
  { emoji: "\u{1F4A1}", fuerte: "Busca buena luz", resto: " para tu selfie", color: "0,229,255" },
  { emoji: "\u{1F465}", fuerte: "Sugerencia:", resto: " máximo 2 personas para un resultado óptimo", color: "224,64,251" },
  { emoji: "\u{23F3}", fuerte: "El modo HD puede tardar hasta 4 minutos,", resto: " ten paciencia", color: "0,229,255" },
  { emoji: "\u{1F4F1}", fuerte: "No cierres la app", resto: " ni bloquees el celular mientras se genera", color: "224,64,251" },
];
const EMOJI_BRILLO = "\u{2728}";
const EMOJI_CONTROL = "\u{1F3AE}";

// Consulta en el momento si el evento tiene la aprobación automática encendida.
const leerAutoAprobar = async (eventoId) => {
  const { data } = await supabase.from("eventos").select("auto_aprobar").eq("id", eventoId).single();
  return data?.auto_aprobar === true;
};

const esCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

export default function Asistente({ evento }) {
  const [step, setStep] = useState("subir");
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [autorizada, setAutorizada] = useState(true);
  const [aprobadaDirecto, setAprobadaDirecto] = useState(false);

  const [generandoIA, setGenerandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");
  const [errorReintentable, setErrorReintentable] = useState(true);
  const [iaLista, setIaLista] = useState(false);
  const [urlResultadoIA, setUrlResultadoIA] = useState(null);
  const [fotoIdIA, setFotoIdIA] = useState(null);
  const [intentosIA, setIntentosIA] = useState(0);
  const [confirmandoIA, setConfirmandoIA] = useState(false);
  const [iaConfirmada, setIaConfirmada] = useState(false);
  const [modoSeleccionado, setModoSeleccionado] = useState(null);
  const [descargandoFoto, setDescargandoFoto] = useState(false);
  const [reusarFoto, setReusarFoto] = useState(false);
  const [mostrarInstructivo, setMostrarInstructivo] = useState(false);
  const [jugando, setJugando] = useState(false);
  const MAX_INTENTOS_IA = 2;

  const fileRef = useRef();
  const fileRefCamara = useRef();
  const fileRefIAGaleria = useRef();
  const fileRefIACamara = useRef();
  const modoParaSubidaRef = useRef(null);
  const seguirGenerandoRef = useRef(true);
  const wakeLockRef = useRef(null);
  const audioCtxRef = useRef(null);

  const mensaje = evento?.mensaje_subida || "Subir foto";
  const esPremium = evento?.motor_ia === "premium";
  const claveInstructivo = evento ? `funfoto_instructivo_${evento.id}` : null;

  // Estado de la foto que se le informa al minijuego.
  let estadoFoto = "generando";
  if (!generandoIA && errorIA) estadoFoto = "error";
  else if (!generandoIA && iaLista) estadoFoto = "lista";

  const textoTrasConfirmar = aprobadaDirecto
    ? "¡Tu foto ya está en la pantalla del evento!"
    : "El operador la revisa y, si la aprueba, aparece en la pantalla.";

  /* ---------- Sonido y vibración al terminar ---------- */

  // El navegador solo deja sonar audio si se "despertó" con un toque del
  // usuario. Por eso se llama en cada botón que inicia una generación.
  const prepararAudio = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    } catch {
      // Sin audio no pasa nada.
    }
  };

  // Vibra (Android) y suena un ding-ding corto.
  const avisarFotoLista = () => {
    try {
      if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
    } catch {
      // iPhone no permite vibrar desde la web.
    }
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const ahora = ctx.currentTime;
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ahora + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      });
    } catch {
      // Sin audio no pasa nada.
    }
  };

  /* ---------- Pantalla encendida mientras genera ---------- */
  useEffect(() => {
    if (!generandoIA) return;
    let activo = true;

    const pedir = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Si el celular no lo permite, sigue normal.
      }
    };

    // Si la persona sale de la app y vuelve, se pide de nuevo.
    const alVolver = () => {
      if (activo && document.visibilityState === "visible") pedir();
    };

    pedir();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [generandoIA]);

  /* ---------- Instructivo (una vez por evento y celular) ---------- */
  const abrirFunfoto = () => {
    prepararAudio();
    let visto = false;
    try {
      visto = claveInstructivo ? localStorage.getItem(claveInstructivo) === "1" : false;
    } catch {
      visto = false;
    }
    if (visto) {
      setStep("catalogo");
    } else {
      setMostrarInstructivo(true);
    }
  };

  const cerrarInstructivo = () => {
    try {
      if (claveInstructivo) localStorage.setItem(claveInstructivo, "1");
    } catch {
      // Si no se puede guardar, se mostrará de nuevo la próxima vez.
    }
    setMostrarInstructivo(false);
    setStep("catalogo");
  };

  const volverAlCatalogo = () => {
    const modoActual = modoParaSubidaRef.current || modoSeleccionado;
    setStep(esModoDivertido(modoActual) ? "catalogo-divertidos" : "catalogo");
  };

  // Descargar la foto generada.
  // Celular: menú nativo de compartir ("Guardar imagen", WhatsApp, etc.).
  // Computador: descarga directa del archivo.
  const descargarFoto = async () => {
    if (!urlResultadoIA) return;
    setDescargandoFoto(true);
    try {
      const resp = await fetch(urlResultadoIA);
      const blob = await resp.blob();
      const nombre = `funfoto_${Date.now()}.jpg`;
      const archivo = new File([blob], nombre, { type: blob.type || "image/jpeg" });

      if (esCelular() && navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: "Mi FUNfoto IA" });
      } else {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err?.name !== "AbortError") window.open(urlResultadoIA, "_blank", "noopener,noreferrer");
    } finally {
      setDescargandoFoto(false);
    }
  };

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
      const { data: evActual } = await supabase
        .from("eventos").select("evento_cerrado, auto_aprobar").eq("id", evento.id).single();
      if (evActual?.evento_cerrado) {
        setError("Este evento ya cerró. No se pueden subir más fotos.");
        setEnviando(false);
        return;
      }
      const directo = evActual?.auto_aprobar === true;
      const comprimida = await comprimirImagen(file);
      const filename = `${evento.id}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("fotos").upload(filename, comprimida, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("fotos").getPublicUrl(filename);
      const { error: dbErr } = await supabase.from("fotos").insert({
        evento_id: evento.id,
        url: urlData.publicUrl,
        status: directo ? "approved" : "pending",
        autorizada,
      });
      if (dbErr) throw dbErr;
      setAprobadaDirecto(directo);
      setStep("enviada");
    } catch {
      setError("No se pudo enviar la foto. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const generarConIA = async (fileParaIA, modo) => {
    const fileAUsar = fileParaIA || file;
    const modoAUsar = modo || modoSeleccionado;
    if (!fileAUsar || !evento || !modoAUsar) return;
    setGenerandoIA(true);
    setErrorIA("");
    setErrorReintentable(true);
    setIaLista(false);
    setUrlResultadoIA(null);
    seguirGenerandoRef.current = true;

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

      const respuestaCrear = await fetch("/api/generarFoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotoUrl: urlOriginal.publicUrl,
          modo: modoAUsar,
          eventoId: evento.id,
        }),
      });

      const resultadoCrear = await respuestaCrear.json();

      if (!respuestaCrear.ok) {
        throw new Error(resultadoCrear?.error || "Error creando la generación con IA");
      }

      const { taskId, motorUsado } = resultadoCrear;

      for (let intento = 0; intento < MAX_CONSULTAS; intento++) {
        if (!seguirGenerandoRef.current) return;

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const respuestaConsulta = await fetch("/api/consultarFoto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, modo: modoAUsar, eventoId: evento.id, motorUsado }),
        });

        const resultadoConsulta = await respuestaConsulta.json();

        if (!respuestaConsulta.ok) {
          throw new Error(resultadoConsulta?.error || "Error generando la foto con IA");
        }

        if (resultadoConsulta.listo) {
          setUrlResultadoIA(resultadoConsulta?.foto?.url || null);
          setFotoIdIA(resultadoConsulta?.foto?.id || null);
          setIntentosIA((n) => n + 1);
          setIaLista(true);
          setGenerandoIA(false);
          avisarFotoLista();
          return;
        }
      }

      throw new Error("La generación demoró demasiado, intenta de nuevo");
    } catch (err) {
      if (!seguirGenerandoRef.current) return;
      const textoError = err?.message || "";
      const noReintentable = ERRORES_NO_REINTENTABLES.some((t) =>
        textoError.toLowerCase().includes(t)
      );
      setErrorReintentable(!noReintentable);
      setErrorIA(noReintentable ? textoError : MENSAJE_ERROR_REINTENTABLE);
      setGenerandoIA(false);
    }
  };

  // Desde "Otro modo": genera de inmediato con la misma foto.
  const iniciarConFotoGuardada = (modoId) => {
    modoParaSubidaRef.current = modoId;
    setModoSeleccionado(modoId);
    setIntentosIA(0);
    setIaConfirmada(false);
    setReusarFoto(false);
    setStep("ia");
    generarConIA(file, modoId);
  };

  const elegirModo = (modoId) => {
    prepararAudio();
    if (modoId === "futbol_fan") {
      setStep("catalogo-futbol");
      return;
    }
    if (reusarFoto && file) {
      iniciarConFotoGuardada(modoId);
      return;
    }
    modoParaSubidaRef.current = modoId;
    setStep("elegir-fuente-ia");
  };

  const elegirSubmodoFutbol = (modoId) => {
    prepararAudio();
    if (reusarFoto && file) {
      iniciarConFotoGuardada(modoId);
      return;
    }
    modoParaSubidaRef.current = modoId;
    setStep("elegir-fuente-ia");
  };

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
    setReusarFoto(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setStep("ia");
      generarConIA(f, modo);
    };
    reader.readAsDataURL(f);
  };

  // Contador para los puntitos y los mensajes rotativos.
  const [tickGenerando, setTickGenerando] = useState(0);
  useEffect(() => {
    if (!generandoIA) {
      setTickGenerando(0);
      return;
    }
    const t = setInterval(() => setTickGenerando((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [generandoIA]);
  const puntosGenerando = ".".repeat(tickGenerando % 4);
  const mensajeGenerando = MENSAJES_GENERANDO[Math.floor(tickGenerando / 10) % MENSAJES_GENERANDO.length];

  const volverAGenerar = () => {
    if (intentosIA >= MAX_INTENTOS_IA) return;
    prepararAudio();
    setIaLista(false);
    generarConIA(file, modoSeleccionado);
  };

  // Tras un error: misma foto, mismo modo, otra variante. No cuenta como intento.
  const reintentarTrasError = () => {
    if (!file || !modoSeleccionado) { reiniciar(); return; }
    prepararAudio();
    generarConIA(file, modoSeleccionado);
  };

  const limpiarResultado = () => {
    seguirGenerandoRef.current = false;
    setGenerandoIA(false); setErrorIA(""); setErrorReintentable(true); setIaLista(false);
    setUrlResultadoIA(null); setFotoIdIA(null);
    setConfirmandoIA(false); setIaConfirmada(false);
  };

  // Otra selfie: mismo modo, foto nueva.
  const otraSelfie = () => {
    const modoActual = modoSeleccionado || modoParaSubidaRef.current;
    limpiarResultado();
    setPreview(null); setFile(null); setError(""); setReusarFoto(false);
    if (!modoActual) { reiniciar(); return; }
    modoParaSubidaRef.current = modoActual;
    setStep("elegir-fuente-ia");
  };

  // Otro modo: misma foto, eliges otro modo.
  const otroModo = () => {
    if (!file) { reiniciar(); return; }
    limpiarResultado();
    setReusarFoto(true);
    setStep("catalogo");
  };

  const confirmarFotoIA = async () => {
    if (!fotoIdIA) return;
    setConfirmandoIA(true);
    try {
      const directo = await leerAutoAprobar(evento.id);
      const { error: errUpdate } = await supabase
        .from("fotos")
        .update({ status: directo ? "approved" : "pending" })
        .eq("id", fotoIdIA);
      if (errUpdate) throw errUpdate;
      setAprobadaDirecto(directo);
      setIaConfirmada(true);
    } catch {
      setErrorReintentable(false);
      setErrorIA("No se pudo confirmar la foto. Intenta de nuevo.");
    } finally {
      setConfirmandoIA(false);
    }
  };

  const reiniciar = () => {
    seguirGenerandoRef.current = false;
    setJugando(false);
    setStep("subir"); setPreview(null); setFile(null);
    setAutorizada(true); setError(""); setAprobadaDirecto(false); setReusarFoto(false);
    setGenerandoIA(false); setErrorIA(""); setErrorReintentable(true); setIaLista(false);
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

  const avisoMismaFoto = reusarFoto && preview ? (
    <div className="card card-tight" style={{
      display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
      border: "1px solid var(--cyan)",
    }}>
      <img src={preview} alt="Tu foto" style={{
        width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text)" }}>Usarás la misma foto</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Elige un modo y se genera al tiro.</div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setReusarFoto(false)}>
        Usar otra
      </button>
    </div>
  ) : null;

  const consejoSelfie = (
    <div className="chip" style={{
      marginBottom: 18, padding: "10px 14px", fontSize: 12.5,
      lineHeight: 1.5, textAlign: "center", justifyContent: "center",
    }}>
      Consejo: usa una selfie con buena luz y tu rostro bien visible, así la IA te reconoce mejor.
    </div>
  );

  const estiloInputOculto = { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" };

  const estiloTarjetaModo = (borde) => ({
    aspectRatio: "1 / 1", display: "flex", alignItems: "center",
    justifyContent: "center", textAlign: "center", padding: 12,
    cursor: "pointer", border: `1px solid ${borde}`,
    background: "var(--surface)",
  });

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "20px 16px 40px",
    }}>
      {mostrarInstructivo && <Instructivo onAceptar={cerrarInstructivo} />}

      {jugando && (
        <MiniJuego
          eventoId={evento.id}
          estadoFoto={estadoFoto}
          onVerFoto={() => setJugando(false)}
          onCerrar={() => setJugando(false)}
        />
      )}

      <div style={{ width: "100%", maxWidth: 420 }}>

        <input ref={fileRef} type="file" accept="image/*" style={estiloInputOculto}
          onChange={(e) => { tomarArchivo(e.target.files[0]); e.target.value = ""; }} />
        <input ref={fileRefIACamara} type="file" accept="image/*" capture="environment" style={estiloInputOculto}
          onChange={(e) => { tomarArchivoIA(e.target.files[0]); e.target.value = ""; }} />
        <input ref={fileRefIAGaleria} type="file" accept="image/*" style={estiloInputOculto}
          onChange={(e) => { tomarArchivoIA(e.target.files[0]); e.target.value = ""; }} />
        <input ref={fileRefCamara} type="file" accept="image/*" capture="environment" style={estiloInputOculto}
          onChange={(e) => { tomarArchivo(e.target.files[0]); e.target.value = ""; }} />

        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>NexoLED presenta</div>
          <h1 className="display" style={{ fontSize: 26, lineHeight: 1.15 }}>{evento.nombre}</h1>
        </header>

        {step === "subir" && (
          <div className="rise">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <button
                onClick={() => setStep("elegir-fuente-normal")}
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
                <Icon.Camera size={38} color="var(--cyan)" />
                <div className="display" style={{ fontSize: 17, lineHeight: 1.25 }}>{mensaje}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>JPG · PNG · HEIC</div>
              </button>
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

            <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 14, marginTop: 22, lineHeight: 1.6 }}>
              Tu foto pasa por revisión y aparece en la pantalla del evento.
            </p>

            {error && (
              <div className="chip chip-danger" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
                {error}
              </div>
            )}

            {evento?.ia_habilitada !== false && (
              <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px dashed var(--border)", textAlign: "center" }}>
                <button className="btn btn-ghost btn-block" onClick={abrirFunfoto}>
                  FUNfoto IA
                </button>
              </div>
            )}

            <Banner />
          </div>
        )}

        {step === "catalogo" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>FUNfoto IA</div>
              <h2 className="display" style={{ fontSize: 20 }}>Elige un modo</h2>
            </div>

            {avisoMismaFoto || consejoSelfie}

            {esPremium && (
              <button
                onClick={() => setStep("catalogo-divertidos")}
                className="card"
                style={{
                  width: "100%", marginBottom: 16, padding: "22px 16px",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 8, textAlign: "center", cursor: "pointer",
                  border: "1px solid var(--magenta)",
                  background: "linear-gradient(135deg, rgba(224,64,251,0.14), rgba(0,229,255,0.08))",
                  boxShadow: "0 0 30px rgba(224,64,251,0.15)",
                }}
              >
                <span className="eyebrow" style={{ color: "var(--magenta)" }}>Exclusivo de este evento</span>
                <span className="display" style={{ fontSize: 22, color: "#fff" }}>Divertidos</span>
                <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Filtros chistosos para reírse en grupo</span>
              </button>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {MODOS_IA.map((modo) => (
                <button key={modo.id} onClick={() => elegirModo(modo.id)} className="card"
                  style={estiloTarjetaModo("var(--border)")}>
                  <span className="display" style={{ fontSize: 14, color: "#fff" }}>{modo.nombre}</span>
                </button>
              ))}
              <button onClick={() => elegirModo(MODO_FUTBOL_FAN.id)} className="card"
                style={estiloTarjetaModo("var(--cyan)")}>
                <span className="display" style={{ fontSize: 14, color: "#fff" }}>{MODO_FUTBOL_FAN.nombre}</span>
              </button>
            </div>

            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={reiniciar}>
              Volver
            </button>

            <Banner />
          </div>
        )}

        {step === "catalogo-divertidos" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: "var(--magenta)" }}>Exclusivo de este evento</div>
              <h2 className="display" style={{ fontSize: 20 }}>Divertidos</h2>
            </div>

            {avisoMismaFoto || (
              <div className="chip" style={{
                marginBottom: 18, padding: "10px 14px", fontSize: 12.5,
                lineHeight: 1.5, textAlign: "center", justifyContent: "center",
              }}>
                Consejo: salen mejor con la cara de frente y bien iluminada. Funcionan con una o varias personas.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {MODOS_DIVERTIDOS.map((modo) => (
                <button key={modo.id} onClick={() => elegirModo(modo.id)} className="card"
                  style={estiloTarjetaModo("var(--magenta)")}>
                  <span className="display" style={{ fontSize: 14, color: "#fff" }}>{modo.nombre}</span>
                </button>
              ))}
            </div>

            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={() => setStep("catalogo")}>
              Volver al catálogo
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

            {avisoMismaFoto || consejoSelfie}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {SUBMODOS_FUTBOL.map((sub) => (
                <button key={sub.id} onClick={() => elegirSubmodoFutbol(sub.id)} className="card"
                  style={estiloTarjetaModo("var(--border)")}>
                  <span className="display" style={{ fontSize: 14, color: "#fff" }}>{sub.nombre}</span>
                </button>
              ))}
            </div>

            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={() => setStep("catalogo")}>
              Volver al catálogo
            </button>

            <Banner />
          </div>
        )}

        {step === "elegir-fuente-normal" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2 className="display" style={{ fontSize: 20 }}>¿Cómo quieres tu foto?</h2>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }} onClick={() => fileRefCamara.current?.click()}>
              Tomar foto ahora
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => fileRef.current?.click()}>
              Elegir de galería
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={() => setStep("subir")}>
              Volver
            </button>
            <Banner />
          </div>
        )}

        {step === "elegir-fuente-ia" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>FUNfoto IA</div>
              <h2 className="display" style={{ fontSize: 20 }}>¿Cómo quieres tu foto?</h2>
            </div>
            {consejoSelfie}
            <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }}
              onClick={() => { prepararAudio(); fileRefIACamara.current?.click(); }}>
              Tomar foto ahora
            </button>
            <button className="btn btn-ghost btn-block"
              onClick={() => { prepararAudio(); fileRefIAGaleria.current?.click(); }}>
              Elegir de galería
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={volverAlCatalogo}>
              Volver al catálogo
            </button>
            <Banner />
          </div>
        )}

        {step === "ia" && (
          <div className="rise">
            <div className="card" style={{ textAlign: "center" }}>
              {(generandoIA || errorIA) && preview && (
                <img src={preview} alt="Tu foto" style={{
                  width: "100%", maxWidth: 280, margin: "0 auto 18px",
                  borderRadius: "var(--r-md)", aspectRatio: "9/16",
                  objectFit: "cover", display: "block",
                  border: "1px solid var(--border)",
                  opacity: generandoIA ? 0.5 : 1,
                }} />
              )}

              {!generandoIA && iaLista && urlResultadoIA && (
                <>
                  <img src={urlResultadoIA} alt="Tu foto transformada con IA" style={{
                    width: "100%", maxWidth: 280, margin: "0 auto 10px",
                    borderRadius: "var(--r-md)", aspectRatio: "9/16",
                    objectFit: "cover", display: "block",
                    border: "1px solid var(--cyan)",
                  }} />
                  <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}
                    onClick={descargarFoto} disabled={descargandoFoto}>
                    <Icon.Download size={14} /> {descargandoFoto ? "Preparando..." : "Descargar"}
                  </button>
                </>
              )}

              {generandoIA && (
                <>
                  <style>{`@keyframes nexoGirar { to { transform: rotate(360deg); } }`}</style>
                  <div style={{
                    width: 46, height: 46, margin: "0 auto 16px", borderRadius: "50%",
                    border: "3px solid rgba(0,229,255,0.15)",
                    borderTopColor: "var(--cyan)",
                    animation: "nexoGirar 0.9s linear infinite",
                  }} />
                  <div className="display" style={{ fontSize: 17, marginBottom: 8 }}>
                    Generando con IA<span style={{ display: "inline-block", width: 24, textAlign: "left" }}>{puntosGenerando}</span>
                  </div>
                  <p style={{ color: "var(--cyan)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 6, minHeight: 22 }}>
                    {mensajeGenerando}
                  </p>
                  <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.6 }}>
                    Puede tardar hasta 4 minutos. No cierres esta pantalla, te avisamos con un sonido cuando esté lista.
                  </p>

                  <button
                    onClick={() => { prepararAudio(); setJugando(true); }}
                    style={{
                      width: "100%", marginTop: 18, padding: "14px 16px", borderRadius: 14,
                      border: "1px solid rgba(224,64,251,0.55)", cursor: "pointer",
                      fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)", color: "#fff",
                      background: "linear-gradient(135deg, rgba(224,64,251,0.22), rgba(0,229,255,0.14))",
                      boxShadow: "0 0 26px rgba(224,64,251,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{EMOJI_CONTROL}</span>
                    Jugar mientras esperas
                  </button>
                </>
              )}

              {/* Resultado listo, ANTES de usar la foto */}
              {!generandoIA && iaLista && !iaConfirmada && (
                <>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>¿Te gusta el resultado?</h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>
                    Intento {intentosIA} de {MAX_INTENTOS_IA}
                  </p>
                  {intentosIA >= MAX_INTENTOS_IA && (
                    <p style={{ color: "var(--warn, #f5a623)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
                      Ya usaste tus {MAX_INTENTOS_IA} intentos con este modo. Puedes usar esta foto, probar otro modo u otra selfie.
                    </p>
                  )}

                  <button className="btn btn-primary btn-block" style={{ marginTop: 14 }}
                    onClick={confirmarFotoIA} disabled={confirmandoIA}>
                    {confirmandoIA ? "Confirmando..." : "Usar esta foto"}
                  </button>

                  <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }}
                    onClick={volverAGenerar} disabled={intentosIA >= MAX_INTENTOS_IA || confirmandoIA}>
                    Volver a generar
                  </button>

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otraSelfie} disabled={confirmandoIA}>
                      Otra selfie
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otroModo} disabled={confirmandoIA}>
                      Otro modo
                    </button>
                  </div>
                </>
              )}

              {/* Foto ya usada: solo Volver */}
              {!generandoIA && iaLista && iaConfirmada && (
                <>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%", background: "var(--tint-cyan)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
                  }}>
                    <Icon.Check size={26} color="var(--cyan)" />
                  </div>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>¡Listo!</h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                    {textoTrasConfirmar}
                  </p>
                  <button className="btn btn-ghost btn-block" onClick={reiniciar}>Volver</button>
                </>
              )}

              {/* Error */}
              {!generandoIA && errorIA && (
                <>
                  <div className="chip chip-danger" style={{
                    marginBottom: 18, width: "100%", justifyContent: "center",
                    lineHeight: 1.5, textAlign: "center", padding: "10px 14px",
                  }}>
                    {errorIA}
                  </div>

                  {errorReintentable && (
                    <>
                      <button className="btn btn-primary btn-block" onClick={reintentarTrasError}>
                        Intentar de nuevo
                      </button>
                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otraSelfie}>Otra selfie</button>
                        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otroModo}>Otro modo</button>
                      </div>
                    </>
                  )}

                  <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={reiniciar}>
                    Volver al inicio
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
              <img src={preview} alt="Vista previa de tu foto" style={{
                width: "100%", borderRadius: "var(--r-md)", aspectRatio: "4/3",
                objectFit: "cover", marginBottom: 18, border: "1px solid var(--border)",
              }} />

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
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reiniciar} disabled={enviando}>Cambiar</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={enviar} disabled={enviando}>
                  {enviando ? "Enviando..." : "Enviar foto"}
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
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
              }}>
                <Icon.Check size={26} color="var(--cyan)" />
              </div>
              <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>Foto enviada</h2>
              <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                {textoTrasConfirmar}
              </p>
              <button className="btn btn-ghost btn-block" onClick={reiniciar}>Volver</button>
            </div>
            <Banner />
          </div>
        )}
      </div>
    </div>
  );
}

/* Ventana del instructivo: aparece una vez por evento y celular. */
function Instructivo({ onAceptar }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(5,5,10,0.72)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, animation: "nexoAparecer 0.25s ease both",
    }}>
      <style>{`
        @keyframes nexoAparecer { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nexoSubir { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes nexoItem { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }
        @keyframes nexoBrillo {
          0%, 100% { box-shadow: 0 0 22px rgba(224,64,251,0.35), 0 0 0 1px rgba(224,64,251,0.4); transform: scale(1); }
          50% { box-shadow: 0 0 36px rgba(0,229,255,0.45), 0 0 0 1px rgba(0,229,255,0.5); transform: scale(1.05); }
        }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 380,
        background: "linear-gradient(160deg, #16162a 0%, #0d0d16 100%)",
        border: "1px solid rgba(224,64,251,0.45)",
        borderRadius: 22, padding: "28px 22px 22px",
        boxShadow: "0 0 60px rgba(224,64,251,0.18), 0 20px 50px rgba(0,0,0,0.5)",
        animation: "nexoSubir 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
      }}>
        <div style={{
          width: 66, height: 66, borderRadius: "50%", margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32,
          background: "radial-gradient(circle, rgba(224,64,251,0.28), rgba(0,229,255,0.08))",
          animation: "nexoBrillo 2.6s ease-in-out infinite",
        }}>
          {EMOJI_BRILLO}
        </div>

        <div className="eyebrow" style={{ textAlign: "center", color: "var(--magenta)", marginBottom: 6 }}>
          FUNfoto IA
        </div>
        <h2 className="display" style={{ textAlign: "center", fontSize: 21, marginBottom: 20 }}>
          Antes de tu FUNfoto
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {CONSEJOS_INSTRUCTIVO.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 14px", borderRadius: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              animation: `nexoItem 0.4s ease ${0.15 + i * 0.1}s both`,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 21,
                background: `rgba(${c.color},0.12)`,
                border: `1px solid rgba(${c.color},0.35)`,
              }}>
                {c.emoji}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--text-dim)" }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{c.fuerte}</span>
                {c.resto}
              </div>
            </div>
          ))}
        </div>

        <button onClick={onAceptar} style={{
          width: "100%", padding: "14px 16px", borderRadius: 14, border: "none",
          cursor: "pointer", fontSize: 15, fontWeight: 700,
          fontFamily: "var(--font-body)", color: "#0a0a0f",
          background: "linear-gradient(90deg, var(--cyan), var(--magenta))",
          boxShadow: "0 0 24px rgba(0,229,255,0.25)",
        }}>
          ¡Entendido, vamos!
        </button>
      </div>
    </div>
  );
}

function Banner() {
  return (
    <button
      onClick={() => window.open("https://nexoled.cl", "_blank", "noopener,noreferrer")}
      style={{
        display: "block", width: "100%", marginTop: 22, padding: 0,
        background: "none", border: "none", cursor: "pointer", textAlign: "center",
      }}
    >
      <div style={{
        padding: 18, background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", textAlign: "center",
      }}>
        <div className="display" style={{ fontSize: 15, marginBottom: 6 }}>¿Quieres esto en tu evento?</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
          Pantallas LED para bodas, cumpleaños y eventos en Punta Arenas.
        </div>
        <span className="btn btn-primary btn-sm">Ver NexoLED</span>
      </div>
    </button>
  );
}