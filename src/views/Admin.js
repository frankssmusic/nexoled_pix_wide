import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase";
import { ADMIN_PASSWORD, generarSlug, sufijoCorto, urlsDe } from "../lib";
import { cargarJSZip, cargarXLSX } from "../cdn";
import Icon from "../components/Icons";
import { Logo, Toast, Stat, Vacio, Modal } from "../components/UI";

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
  const [expandido, setExpandido] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [editando, setEditando] = useState({});      // { [eventoId]: { nombre, clave } }
  const [guardando, setGuardando] = useState(null);  // eventoId que está guardando
  const [operadores, setOperadores] = useState([]);
  const [verOps, setVerOps] = useState(false);
  const [opsSel, setOpsSel] = useState([]);

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
      });
      if (err) throw err;
      setNuevoNombre("");
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
    setToast("Preparando descarga…");
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

  /* Inicializa los campos de edición al expandir un evento */
  const abrirExpandido = (ev) => {
    const abierto = expandido === ev.id;
    setExpandido(abierto ? null : ev.id);
    if (!abierto) {
      setEditando((prev) => ({
        ...prev,
        [ev.id]: { nombre: ev.nombre, clave: ev.clave_operador },
      }));
    }
  };

  const guardarConfig = async (ev) => {
    const campos = editando[ev.id];
    if (!campos?.nombre?.trim()) { setToast("El nombre no puede estar vacío"); return; }
    setGuardando(ev.id);
    const { error: err } = await supabase.from("eventos").update({
      nombre: campos.nombre.trim(),
      clave_operador: campos.clave.trim() || ev.clave_operador,
    }).eq("id", ev.id);
    setGuardando(null);
    if (err) { setToast("No se pudo guardar"); return; }
    setToast("Configuración guardada");
    cargarEventos();
  };

  const regenerarClave = async (ev) => {
    const nueva = Math.random().toString(36).slice(2, 8);
    await actualizar(ev, {
      clave_operador: nueva,
      session_version: (ev.session_version || 1) + 1,
    }, "Clave regenerada — sesiones anteriores expiradas");
    setEditando((prev) => ({ ...prev, [ev.id]: { ...prev[ev.id], clave: nueva } }));
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
            <Icon.Plus size={16} /> {creando ? "Creando…" : "Crear"}
          </button>
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
        <div className="card"><Vacio titulo="Cargando eventos…" /></div>
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
                      {c.pending > 0 && !ev.evento_cerrado && (
                        <span className="chip chip-warn">{c.pending} por revisar</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
                      /{ev.slug} · clave {ev.evento_cerrado ? "expirada" : ev.clave_operador}
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
                          El ↻ genera una clave nueva y expira las sesiones activas.
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => guardarConfig(ev)}
                        disabled={guardando === ev.id}
                      >
                        {guardando === ev.id ? "Guardando…" : "Guardar cambios"}
                      </button>
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

                    {/* Controles — distintos según estado */}
                    {ev.evento_cerrado ? (
                      <>
                        <div className="label">Acciones</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {/* Descarga directa desde admin para eventos cerrados */}
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
