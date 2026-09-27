import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase";
import { ADMIN_PASSWORD, generarSlug, sufijoCorto, urlsDe } from "../lib";
import { cargarJSZip, cargarXLSX } from "../cdn";
import Icon from "../components/Icons";
import { Logo, Toast, Stat, Vacio, Modal } from "../components/UI";

// Costo por foto IA según el motor del evento (precios públicos de WaveSpeed).
// base -> Seedream 5.0 Pro 1k | premium -> GPT Image 2 medium
const COSTOS_USD_POR_FOTO_IA = { base: 0.045, premium: 0.0665 };

// Dólar de respaldo si no se puede obtener el del día desde mindicador.cl.
const CLP_POR_USD_RESPALDO = 950;

// Precio sugerido: costo x 1,4 (40% de utilidad sobre el costo) x 1,19 (IVA).
const FACTOR_UTILIDAD = 1.4;
const TASA_IVA = 0.19;

const TIERS = [
  { id: "base", nombre: "Base" },
  { id: "premium", nombre: "Premium" },
];

// Planes de fotos por persona.
const PLANES_FOTOS = [
  { id: "estandar", nombre: "Estándar", fotos: 2 },
  { id: "funplus", nombre: "FunPlus", fotos: 4 },
  { id: "maxfun", nombre: "MaxFun", fotos: 15 },
];

const planPorId = (id) => PLANES_FOTOS.find((p) => p.id === id) || PLANES_FOTOS[0];
const clp = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [eventos, setEventos] = useState([]);
  const [conteos, setConteos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [verCerrados, setVerCerrados] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoMotor, setNuevoMotor] = useState("base");
  const [expandido, setExpandido] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [editando, setEditando] = useState({});      // { [eventoId]: { nombre, clave, invitados, plan } }
  const [guardando, setGuardando] = useState(null);  // eventoId que está guardando
  const [extraInput, setExtraInput] = useState({});  // { [eventoId]: "50" }
  const [operadores, setOperadores] = useState([]);
  const [verOps, setVerOps] = useState(false);
  const [opsSel, setOpsSel] = useState([]);
  const [dolar, setDolar] = useState({ valor: CLP_POR_USD_RESPALDO, fecha: null, oficial: false });

  /* ---------- Dólar del día (mindicador.cl, dólar observado Banco Central) ---------- */
  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const r = await fetch("https://mindicador.cl/api/dolar");
        const d = await r.json();
        const ultimo = d?.serie?.[0];
        if (ultimo?.valor) {
          setDolar({ valor: ultimo.valor, fecha: ultimo.fecha, oficial: true });
        }
      } catch {
        // Si falla, queda el valor de respaldo.
      }
    })();
  }, [loggedIn]);

  /* ---------- Cargar eventos + conteo de fotos ---------- */
  const cargarEventos = useCallback(async () => {
    const { data } = await supabase
      .from("eventos").select("*").order("created_at", { ascending: false });
    const lista = data || [];
    setEventos(lista);

    const { data: fotosAll } = await supabase.from("fotos").select("evento_id, status");
    const mapa = {};
    (fotosAll || []).forEach((f) => {
      if (!mapa[f.evento_id]) mapa[f.evento_id] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      mapa[f.evento_id].total++;
      mapa[f.evento_id][f.status]++;
    });
    setConteos(mapa);
    setCargando(false);
  }, []);

  useEffect(() => { if (loggedIn) cargarEventos(); }, [loggedIn, cargarEventos]);

  /* Refresco automático mientras hay eventos en vivo */
  useEffect(() => {
    if (!loggedIn) return;
    const t = setInterval(cargarEventos, 20000);
    return () => clearInterval(t);
  }, [loggedIn, cargarEventos]);

  /* ---------- Crear evento con slug único ---------- */
  const crearEvento = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) { setToast("Escribe un nombre para el evento"); return; }
    setCreando(true);
    try {
      let slug = generarSlug(nombre);
      const { data: existe } = await supabase.from("eventos").select("id").eq("slug", slug).maybeSingle();
      if (existe) slug = `${slug}-${sufijoCorto()}`;

      const clave = Math.random().toString(36).slice(2, 8);
      const { error: err } = await supabase.from("eventos").insert({
        nombre,
        slug,
        clave_operador: clave,
        activo: true,
        evento_cerrado: false,
        descarga_habilitada: false,
        mensaje_subida: "Subir foto",
        session_version: 1,
        ia_habilitada: true,
        motor_ia: nuevoMotor,
        cuota_plan: "estandar",
        fotos_por_persona: 2,
      });
      if (err) throw err;
      setNuevoNombre("");
      setNuevoMotor("base");
      setToast(`Evento creado: ${slug}`);
      cargarEventos();
    } catch {
      setToast("No se pudo crear el evento");
    } finally {
      setCreando(false);
    }
  };

  /* ---------- Acciones por evento ---------- */
  const actualizar = async (ev, campos, mensaje) => {
    const { error: err } = await supabase.from("eventos").update(campos).eq("id", ev.id);
    if (err) { setToast("No se pudo guardar"); return; }
    setToast(mensaje);
    cargarEventos();
  };

  const alternarCerrado = (ev) => {
    if (ev.evento_cerrado) {
      actualizar(ev, {
        evento_cerrado: false,
        clave_operador: Math.random().toString(36).slice(2, 8),
        descarga_habilitada: false,
        session_version: (ev.session_version || 1) + 1,
      }, "Evento reabierto con clave nueva");
    } else {
      actualizar(ev, {
        evento_cerrado: true,
        descarga_habilitada: false,
        session_version: (ev.session_version || 1) + 1,
      }, "Evento cerrado");
    }
  };

  const borrarFotos = async (ev) => {
    if (!window.confirm(`¿Borrar todas las fotos de "${ev.nombre}"?`)) return;
    const { data: fs } = await supabase.from("fotos").select("url").eq("evento_id", ev.id);
    if (fs?.length) {
      const paths = fs.map((f) => f.url.split("/fotos/")[1]).filter(Boolean);
      if (paths.length) await supabase.storage.from("fotos").remove(paths);
    }
    await supabase.from("fotos").delete().eq("evento_id", ev.id);
    setToast("Fotos borradas");
    cargarEventos();
  };

  const eliminarEvento = async (ev) => {
    if (!window.confirm(`¿Eliminar "${ev.nombre}" y todo su contenido? Esto no se puede deshacer.`)) return;
    const { data: fs } = await supabase.from("fotos").select("url").eq("evento_id", ev.id);
    if (fs?.length) {
      const paths = fs.map((f) => f.url.split("/fotos/")[1]).filter(Boolean);
      if (paths.length) await supabase.storage.from("fotos").remove(paths);
    }
    await supabase.from("fotos").delete().eq("evento_id", ev.id);
    await supabase.from("operadores").delete().eq("evento_id", ev.id);
    await supabase.from("eventos").delete().eq("id", ev.id);
    setToast(`"${ev.nombre}" eliminado`);
    cargarEventos();
  };

  const descargarFotos = async (ev) => {
    const { data: fs } = await supabase
      .from("fotos").select("*").eq("evento_id", ev.id).eq("status", "approved");
    if (!fs?.length) { setToast("No hay fotos aprobadas"); return; }
    setToast("Preparando descarga...");
    try {
      const JSZip = await cargarJSZip();
      const zip = new JSZip();
      for (let i = 0; i < fs.length; i++) {
        const blob = await (await fetch(fs[i].url)).blob();
        const suf = fs[i].autorizada === false ? "_NO_AUTORIZADA" : "";
        zip.file(`foto_${i + 1}${suf}.jpg`, blob);
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${ev.slug || "evento"}_fotos.zip`; a.click();
      URL.revokeObjectURL(url);
      setToast(`${fs.length} fotos descargadas`);
    } catch { setToast("No se pudo generar la descarga"); }
  };

  /* Fotos extra agregadas a mano: lo que la cuota guardada tiene por
     sobre invitados x fotos por persona. Así no se pierden al recalcular. */
  const calcularExtra = (ev) => {
    const fpp = ev.fotos_por_persona || planPorId(ev.cuota_plan).fotos;
    const base = (ev.invitados || 0) * fpp;
    return Math.max(0, (ev.cuota_ia || 0) - base);
  };

  /* Inicializa los campos de edición al expandir un evento */
  const abrirExpandido = (ev) => {
    const abierto = expandido === ev.id;
    setExpandido(abierto ? null : ev.id);
    if (!abierto) {
      setEditando((prev) => ({
        ...prev,
        [ev.id]: {
          nombre: ev.nombre,
          clave: ev.clave_operador,
          invitados: ev.invitados ?? "",
          plan: ev.cuota_plan || "estandar",
        },
      }));
    }
  };

  const guardarConfig = async (ev) => {
    const campos = editando[ev.id];
    if (!campos?.nombre?.trim()) { setToast("El nombre no puede estar vacío"); return; }
    setGuardando(ev.id);

    const plan = planPorId(campos.plan);
    const invitadosNum = campos.invitados === "" ? null : parseInt(campos.invitados, 10);
    const extra = calcularExtra(ev);
    const cuotaCalculada = invitadosNum ? invitadosNum * plan.fotos + extra : null;

    const { error: err } = await supabase.from("eventos").update({
      nombre: campos.nombre.trim(),
      clave_operador: campos.clave.trim() || ev.clave_operador,
      invitados: invitadosNum,
      cuota_plan: plan.id,
      fotos_por_persona: plan.fotos,
      cuota_ia: cuotaCalculada,
    }).eq("id", ev.id);
    setGuardando(null);
    if (err) { setToast("No se pudo guardar"); return; }
    setToast("Configuración guardada");
    cargarEventos();
  };

  const agregarCuota = (ev) => {
    const n = parseInt(extraInput[ev.id], 10);
    if (!n || n <= 0) { setToast("Escribe cuántas fotos agregar"); return; }
    if (ev.cuota_ia === null || ev.cuota_ia === undefined) {
      setToast("Primero define los invitados y guarda la configuración");
      return;
    }
    const nueva = ev.cuota_ia + n;
    actualizar(ev, { cuota_ia: nueva }, `Se agregaron ${n} fotos. Cuota total: ${nueva}`);
    setExtraInput((prev) => ({ ...prev, [ev.id]: "" }));
  };

  const regenerarClave = async (ev) => {
    const nueva = Math.random().toString(36).slice(2, 8);
    await actualizar(ev, {
      clave_operador: nueva,
      session_version: (ev.session_version || 1) + 1,
    }, "Clave regenerada, sesiones anteriores expiradas");
    setEditando((prev) => ({ ...prev, [ev.id]: { ...prev[ev.id], clave: nueva } }));
  };

  const cambiarTier = (ev, motor) => {
    if ((ev.motor_ia || "base") === motor) return;
    actualizar(ev, { motor_ia: motor },
      motor === "premium" ? "Evento cambiado a Premium" : "Evento cambiado a Base");
  };

  const copiar = (texto, etiqueta) => {
    navigator.clipboard.writeText(texto);
    setToast(`${etiqueta} copiado`);
  };

  /* ---------- Operadores ---------- */
  const cargarOperadores = async () => {
    const { data } = await supabase
      .from("operadores").select("*, eventos(nombre)").order("created_at", { ascending: false });
    setOperadores(data || []);
    setOpsSel([]);
  };

  const borrarOps = async () => {
    if (!opsSel.length || !window.confirm(`¿Eliminar ${opsSel.length} registro(s)?`)) return;
    await supabase.from("operadores").delete().in("id", opsSel);
    setToast("Registros eliminados");
    cargarOperadores();
  };

  const exportarOps = async () => {
    if (!operadores.length) { setToast("No hay operadores para exportar"); return; }
    try {
      const XLSX = await cargarXLSX();
      const data = operadores.map((op) => ({
        Nombre: op.nombre,
        RUT: op.rut,
        Fecha: new Date(op.created_at).toLocaleDateString("es-CL"),
        Hora: new Date(op.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        Evento: op.eventos?.nombre || "Evento eliminado",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 26 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Operadores");
      XLSX.writeFile(wb, "operadores_nexopix.xlsx");
      setToast(`${operadores.length} registros exportados`);
    } catch { setToast("No se pudo exportar"); }
  };

  /* ---------- LOGIN ---------- */
  if (!loggedIn) {
    const intentar = () => {
      if (pass === ADMIN_PASSWORD) { setLoggedIn(true); setError(""); }
      else setError("Clave incorrecta");
    };
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div className="card rise">
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <Logo size={22} />
              <div className="eyebrow" style={{ marginTop: 10 }}>Panel de administración</div>
            </div>
            <input className="input" type="password" placeholder="Clave de administrador"
              value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && intentar()} />
            {error && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={intentar}>
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activos = eventos.filter((e) => !e.evento_cerrado);
  const cerrados = eventos.filter((e) => e.evento_cerrado);
  const listaVisible = verCerrados ? cerrados : activos;

  const opsPorEvento = operadores.reduce((acc, op) => {
    const k = op.evento_id;
    if (!acc[k]) acc[k] = { nombre: op.eventos?.nombre || "Evento eliminado", ops: [] };
    acc[k].ops.push(op);
    return acc;
  }, {});

  return (
    <div style={{ padding: "20px 16px 60px", maxWidth: 900, margin: "0 auto" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {qrModal && (
        <Modal titulo={qrModal.nombre} onClose={() => setQrModal(null)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ background: "#fff", padding: 16, borderRadius: 14, display: "inline-block", marginBottom: 18 }}>
              <QRCodeSVG value={urlsDe(qrModal.slug).subir} size={230} bgColor="#ffffff" fgColor="#0a0a0f" level="H" />
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, wordBreak: "break-all" }}>
              {urlsDe(qrModal.slug).subir}
            </div>
            <button className="btn btn-ghost btn-block"
              onClick={() => copiar(urlsDe(qrModal.slug).subir, "Enlace")}>
              <Icon.Copy size={15} /> Copiar enlace
            </button>
          </div>
        </Modal>
      )}

      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Logo size={24} />
          <div className="eyebrow" style={{ marginTop: 10 }}>Panel de administración</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
            {dolar.oficial
              ? `Dólar observado hoy: ${clp(dolar.valor)} (mindicador.cl)`
              : `Dólar referencial: ${clp(dolar.valor)} (no se pudo obtener el del día)`}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={cargarEventos} title="Actualizar estado">
          <Icon.Refresh size={16} /> Actualizar
        </button>
      </header>

      {/* Crear evento */}
      <div className="card" style={{ marginBottom: 16 }}>
        <label className="label">Nuevo evento</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="input" style={{ flex: "1 1 200px" }}
            placeholder="Boda Paola y Javier"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crearEvento()} />
          <button className="btn btn-primary" onClick={crearEvento} disabled={creando}>
            <Icon.Plus size={16} /> {creando ? "Creando..." : "Crear"}
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">Tier contratado</label>
          <SelectorPills opciones={TIERS} valor={nuevoMotor} onChange={setNuevoMotor} destacado="premium" />
        </div>

        {nuevoNombre.trim() && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10 }}>
            Dirección: /subir/{generarSlug(nuevoNombre)}
          </div>
        )}
      </div>

      {/* Conmutador activos / cerrados */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[[false, `En vivo (${activos.length})`], [true, `Cerrados (${cerrados.length})`]].map(([val, label]) => (
          <button key={String(val)} onClick={() => setVerCerrados(val)}
            style={{
              cursor: "pointer", padding: "8px 16px", borderRadius: 100, fontSize: 13,
              fontFamily: "var(--font-body)", fontWeight: 500,
              background: verCerrados === val ? "var(--tint-cyan)" : "transparent",
              border: `1px solid ${verCerrados === val ? "rgba(0,229,255,0.22)" : "var(--border)"}`,
              color: verCerrados === val ? "var(--cyan)" : "var(--text-dim)",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Lista de eventos */}
      {cargando ? (
        <div className="card"><Vacio titulo="Cargando eventos..." /></div>
      ) : listaVisible.length === 0 ? (
        <div className="card">
          <Vacio icono="screen"
            titulo={verCerrados ? "Sin eventos cerrados" : "Sin eventos en vivo"}
            detalle={verCerrados ? "Los eventos que cierres aparecen acá." : "Crea un evento arriba para empezar."} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listaVisible.map((ev) => {
            const c = conteos[ev.id] || { total: 0, pending: 0, approved: 0, rejected: 0 };
            const abierto = expandido === ev.id;
            const urls = urlsDe(ev.slug);
            const camposEd = editando[ev.id] || {};
            const tierEv = ev.motor_ia === "premium" ? "premium" : "base";
            const costoPorFoto = COSTOS_USD_POR_FOTO_IA[tierEv];

            const planVista = planPorId(camposEd.plan ?? ev.cuota_plan);
            const planGuardado = planPorId(ev.cuota_plan);
            const extra = calcularExtra(ev);
            const invitadosVista = camposEd.invitados ?? (ev.invitados ?? "");
            const invNum = parseInt(invitadosVista, 10) || 0;
            const cuotaVista = invNum ? invNum * planVista.fotos + extra : (ev.cuota_ia || 0);

            const costoUsd = cuotaVista * costoPorFoto;
            const costoClp = costoUsd * dolar.valor;
            const precioNeto = costoClp * FACTOR_UTILIDAD;
            const ivaClp = precioNeto * TASA_IVA;
            const precioTotal = precioNeto + ivaClp;

            return (
              <div key={ev.id} className="card">
                {/* Cabecera del evento */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="display" style={{ fontSize: 18 }}>{ev.nombre}</span>
                      <span className={`chip ${ev.evento_cerrado ? "chip-danger" : "chip-ok"}`}>
                        <span className={`dot ${ev.evento_cerrado ? "dot-closed" : "dot-live"}`} />
                        {ev.evento_cerrado ? "Cerrado" : "En vivo"}
                      </span>
                      {tierEv === "premium" && (
                        <span className="chip" style={{ color: "var(--magenta)", borderColor: "var(--magenta)" }}>
                          Premium
                        </span>
                      )}
                      <span className="chip">{planGuardado.nombre}</span>
                      {c.pending > 0 && !ev.evento_cerrado && (
                        <span className="chip chip-warn">{c.pending} por revisar</span>
                      )}
                      {ev.ia_habilitada === false && (
                        <span className="chip chip-danger">IA desactivada</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
                      /{ev.slug} · clave {ev.evento_cerrado ? "expirada" : ev.clave_operador}
                      {ev.cuota_ia ? ` · cuota ${ev.cuota_ia} fotos IA` : " · sin cuota definida"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setQrModal(ev)}>
                      <Icon.QR size={15} /> QR
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirExpandido(ev)}>
                      <Icon.Settings size={15} />
                    </button>
                  </div>
                </div>

                {/* Conteos */}
                <div className="grid-stats" style={{ marginTop: 16 }}>
                  <Stat label="Total" value={c.total} color="var(--cyan)" />
                  <Stat label="Aprobadas" value={c.approved} color="var(--ok)" />
                  <Stat label="En espera" value={c.pending} color="var(--warn)" />
                </div>

                {/* Panel expandido */}
                {abierto && (
                  <div className="rise" style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                    {/* Configuración */}
                    <div className="label">Configuración</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                      <div>
                        <label className="label">Nombre del evento</label>
                        <input
                          className="input"
                          value={editando[ev.id]?.nombre ?? ev.nombre}
                          onChange={(e) => setEditando((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], nombre: e.target.value },
                          }))}
                          placeholder="Nombre del evento"
                        />
                      </div>
                      <div>
                        <label className="label">Clave del operador</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            className="input"
                            value={editando[ev.id]?.clave ?? ev.clave_operador}
                            onChange={(e) => setEditando((prev) => ({
                              ...prev,
                              [ev.id]: { ...prev[ev.id], clave: e.target.value },
                            }))}
                            placeholder="Clave"
                            style={{ fontFamily: "monospace", letterSpacing: "0.08em" }}
                          />
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => copiar(editando[ev.id]?.clave ?? ev.clave_operador, "Clave")}
                            title="Copiar clave"
                          >
                            <Icon.Copy size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => regenerarClave(ev)}
                            title="Generar clave nueva"
                          >
                            <Icon.Refresh size={14} />
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          El botón de refrescar genera una clave nueva y expira las sesiones activas.
                        </div>
                      </div>

                      {/* --- Tier contratado --- */}
                      <div>
                        <label className="label">Tier contratado</label>
                        <SelectorPills opciones={TIERS} valor={tierEv}
                          onChange={(motor) => cambiarTier(ev, motor)} destacado="premium" />
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          {tierEv === "premium"
                            ? "Premium: motor GPT Image + modos Divertidos. Se guarda al tocarlo."
                            : "Base: motor Seedream 5, sin modos Divertidos. Se guarda al tocarlo."}
                        </div>
                      </div>

                      {/* --- Plan de fotos --- */}
                      <div>
                        <label className="label">Plan de fotos por persona</label>
                        <SelectorPills
                          opciones={PLANES_FOTOS.map((p) => ({ id: p.id, nombre: `${p.nombre} (${p.fotos})` }))}
                          valor={planVista.id}
                          onChange={(id) => setEditando((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], plan: id },
                          }))}
                        />
                      </div>

                      {/* --- Invitados --- */}
                      <div>
                        <label className="label">N° aproximado de invitados</label>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          value={invitadosVista}
                          onChange={(e) => setEditando((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], invitados: e.target.value },
                          }))}
                          placeholder="Ej: 100"
                        />
                      </div>

                      {/* --- Cuota y cotización --- */}
                      {cuotaVista ? (
                        <div style={{
                          padding: 12, background: "var(--bg)",
                          border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                        }}>
                          <FilaMonto etiqueta="Cuota de fotos IA" valor={`${cuotaVista} fotos`} color="var(--cyan)" />
                          {extra > 0 && (
                            <div style={{ fontSize: 11, color: "var(--text-faint)", margin: "-2px 0 6px" }}>
                              Incluye {extra} fotos extra agregadas a mano.
                            </div>
                          )}
                          <FilaMonto etiqueta="Costo máximo IA"
                            valor={`${clp(costoClp)} (US$${costoUsd.toFixed(2)})`} />
                          <div style={{ borderTop: "1px dashed var(--border)", margin: "8px 0" }} />
                          <FilaMonto etiqueta="Precio neto (+40%)" valor={clp(precioNeto)} />
                          <FilaMonto etiqueta="IVA (19%)" valor={clp(ivaClp)} />
                          <FilaMonto etiqueta="Total sugerido" valor={clp(precioTotal)} color="var(--ok)" fuerte />
                          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
                            Negocia entre el costo máximo y el total. Cálculo: {invNum || "?"} invitados x {planVista.fotos} fotos
                            {extra > 0 ? ` + ${extra} extra` : ""}, a US${costoPorFoto} por foto (tier {tierEv}), dólar {clp(dolar.valor)}.
                            Solo cubre el costo de IA, no el arriendo de la pantalla.
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          Ingresa el número de invitados para calcular la cuota y la cotización.
                        </div>
                      )}

                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => guardarConfig(ev)}
                        disabled={guardando === ev.id}
                        style={{ marginTop: 4 }}
                      >
                        {guardando === ev.id ? "Guardando..." : "Guardar cambios"}
                      </button>

                      {/* --- Agregar cuota (se guarda al tiro) --- */}
                      <div style={{ marginTop: 8 }}>
                        <label className="label">Agregar cuota extra</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            className="input"
                            type="number"
                            min="1"
                            value={extraInput[ev.id] ?? ""}
                            onChange={(e) => setExtraInput((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                            placeholder="Ej: 50"
                          />
                          <button className="btn btn-ghost btn-sm" onClick={() => agregarCuota(ev)}>
                            <Icon.Plus size={14} /> Agregar
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          Suma fotos a la cuota actual sin reemplazarla. Úsalo para vender extensiones durante el evento.
                        </div>
                      </div>

                      {/* --- Interruptor de FUNfoto IA --- */}
                      <Fila
                        titulo="FUNfoto IA"
                        detalle={ev.ia_habilitada === false
                          ? "Desactivada: el botón no aparece para los invitados"
                          : "Activada: los invitados pueden generar fotos con IA"}
                        activo={ev.ia_habilitada !== false}
                        onToggle={() => actualizar(ev, { ia_habilitada: ev.ia_habilitada === false },
                          ev.ia_habilitada === false ? "IA activada" : "IA desactivada")}
                      />
                    </div>

                    {/* Enlaces */}
                    <div className="label">Enlaces del evento</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                      {[["Asistente", urls.subir], ["Operador", urls.operador], ["Pantalla", urls.pantalla]].map(([nom, u]) => (
                        <button key={nom} onClick={() => copiar(u, nom)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                            padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)",
                            borderRadius: "var(--r-sm)", cursor: "pointer", textAlign: "left", width: "100%",
                            fontFamily: "var(--font-body)",
                          }}>
                          <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 70 }}>{nom}</span>
                          <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.replace(window.location.origin, "")}
                          </span>
                          <Icon.Copy size={14} color="var(--text-faint)" />
                        </button>
                      ))}
                    </div>

                    {/* Controles: distintos según estado */}
                    {ev.evento_cerrado ? (
                      <>
                        <div className="label">Acciones</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button className="btn btn-primary btn-block" onClick={() => descargarFotos(ev)}>
                            <Icon.Download size={15} /> Descargar fotos aprobadas ({conteos[ev.id]?.approved || 0})
                          </button>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => alternarCerrado(ev)}>
                              <Icon.Unlock size={14} /> Reabrir evento
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => borrarFotos(ev)}>
                              <Icon.Trash size={14} /> Borrar fotos
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => eliminarEvento(ev)}>
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="label">Controles</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <Fila
                            titulo="Descarga de fotos"
                            detalle="El operador puede bajar las fotos aprobadas"
                            activo={ev.descarga_habilitada}
                            onToggle={() => actualizar(ev, { descarga_habilitada: !ev.descarga_habilitada },
                              ev.descarga_habilitada ? "Descarga desactivada" : "Descarga activada")}
                          />
                          <Fila
                            titulo={ev.evento_cerrado ? "Evento cerrado" : "Evento en vivo"}
                            detalle={ev.evento_cerrado
                              ? "Al reabrir se genera una clave nueva"
                              : "Al cerrar expira la clave y se cierran las sesiones"}
                            activo={ev.evento_cerrado}
                            onToggle={() => alternarCerrado(ev)}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => descargarFotos(ev)}>
                            <Icon.Download size={14} /> Descargar
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => borrarFotos(ev)}>
                            <Icon.Trash size={14} /> Borrar fotos
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => eliminarEvento(ev)}>
                            Eliminar evento
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Historial de operadores */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon.User size={17} color="var(--text-dim)" />
            <span className="display" style={{ fontSize: 16 }}>Operadores registrados</span>
          </div>
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setVerOps(!verOps); if (!verOps) cargarOperadores(); }}>
            {verOps ? "Ocultar" : "Ver registros"}
          </button>
        </div>

        {verOps && (
          <div style={{ marginTop: 16 }}>
            {operadores.length === 0 ? (
              <Vacio icono="inbox" titulo="Sin registros" detalle="Los operadores que se registren aparecen acá." />
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setOpsSel((s) => s.length === operadores.length ? [] : operadores.map((o) => o.id))}>
                    {opsSel.length === operadores.length ? "Quitar selección" : "Seleccionar todo"}
                  </button>
                  {opsSel.length > 0 && (
                    <button className="btn btn-danger btn-sm" onClick={borrarOps}>
                      <Icon.Trash size={14} /> Eliminar ({opsSel.length})
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={exportarOps}>
                    <Icon.Sheet size={14} /> Exportar Excel
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {Object.entries(opsPorEvento).map(([eid, grupo]) => (
                    <div key={eid}>
                      <div className="eyebrow" style={{ color: "var(--magenta)", marginBottom: 8 }}>
                        {grupo.nombre} · {grupo.ops.length}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {grupo.ops.map((op) => {
                          const sel = opsSel.includes(op.id);
                          return (
                            <button key={op.id}
                              onClick={() => setOpsSel((s) => s.includes(op.id) ? s.filter((x) => x !== op.id) : [...s, op.id])}
                              style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                                padding: "10px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
                                background: sel ? "var(--tint-cyan)" : "var(--bg)",
                                border: `1px solid ${sel ? "rgba(0,229,255,0.3)" : "var(--border)"}`,
                                textAlign: "left", width: "100%", fontFamily: "var(--font-body)",
                              }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                                <span style={{
                                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                  border: sel ? "none" : "1px solid var(--border-strong)",
                                  background: sel ? "var(--cyan)" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  {sel && <Icon.Check size={13} color="#0a0a0f" />}
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 14, color: "var(--text)" }}>{op.nombre}</div>
                                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{op.rut}</div>
                                </div>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right", flexShrink: 0 }}>
                                {new Date(op.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                                <br />
                                {new Date(op.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Selector de pastillas (tier o plan de fotos) */
function SelectorPills({ opciones, valor, onChange, destacado }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {opciones.map((o) => {
        const activo = valor === o.id;
        const esDestacado = destacado && o.id === destacado;
        const colorActivo = esDestacado ? "var(--magenta)" : "var(--cyan)";
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1, minWidth: 90, cursor: "pointer", padding: "10px 12px", borderRadius: 100, fontSize: 13,
              fontFamily: "var(--font-body)", fontWeight: 500,
              background: activo ? (esDestacado ? "rgba(224,64,251,0.12)" : "var(--tint-cyan)") : "transparent",
              border: `1px solid ${activo ? colorActivo : "var(--border)"}`,
              color: activo ? colorActivo : "var(--text-dim)",
            }}
          >
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}

/* Fila de monto dentro de la cotización */
function FilaMonto({ etiqueta, valor, color, fuerte }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: "var(--text-dim)" }}>{etiqueta}</span>
      <span style={{ color: color || "var(--text)", fontWeight: fuerte ? 600 : 400 }}>{valor}</span>
    </div>
  );
}

/* Fila con interruptor */
function Fila({ titulo, detalle, activo, onToggle }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
      padding: "12px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text)" }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3, lineHeight: 1.5 }}>{detalle}</div>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={activo}
        aria-label={titulo}
        style={{
          width: 44, height: 25, borderRadius: 100, flexShrink: 0, cursor: "pointer",
          border: "none", padding: 0, position: "relative",
          background: activo ? "var(--cyan)" : "var(--border-strong)",
          transition: "background 0.18s ease",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: activo ? 22 : 3,
          width: 19, height: 19, borderRadius: "50%", background: "#fff",
          transition: "left 0.18s ease",
        }} />
      </button>
    </div>
  );
}