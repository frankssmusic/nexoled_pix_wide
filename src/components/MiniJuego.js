// src/components/MiniJuego.js
//
// Minijuego de naves para la espera de FUNfoto IA.
// - La nave avanza (fondo de estrellas en 3 capas) y dispara sola.
// - Se mueve arrastrando el dedo.
// - Sube de nivel cada 20 segundos: enemigos más rápidos y tipos nuevos.
// - Cajas de premio: vida, arma doble/triple, escudo y disparo rápido.
// - Al terminar se guarda el puntaje con un apodo y se muestra el top 5
//   del evento (solo lo ve quien jugó).
// - Cuando la foto está lista, el juego se pausa y la persona decide.
//
// Los emojis van como códigos para que no se corrompan al copiar.

import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

const COLORES = {
  cian: "#00e5ff",
  magenta: "#e040fb",
  rojo: "#ff2b4d",
  amarillo: "#ffd23f",
  verde: "#3dff9a",
};

const PUNTAJE_MAXIMO = 500000;
const SEGUNDOS_POR_NIVEL = 20;
const VIDAS_INICIALES = 3;
const VIDAS_MAXIMAS = 5;
const CORAZON = "\u2665";
const CLAVE_APODO = "funfoto_apodo";
const FUENTE = "system-ui, -apple-system, sans-serif";

const EMOJI_FIESTA = "\u{1F389}";
const EMOJI_ALERTA = "\u{26A0}\u{FE0F}";
const EMOJI_TROFEO = "\u{1F3C6}";
const EMOJI_COHETE = "\u{1F680}";
const MEDALLAS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

const PUNTOS_POR_TIPO = { simple: 10, zigzag: 20, blindado: 50, tirador: 40 };

// Filtro básico de apodos groseros.
const PALABRAS_BLOQUEADAS = [
  "weon", "hueon", "aweonao", "culiao", "culia", "ctm", "csm", "conchetumare",
  "conchatumadre", "conchesumadre", "chucha", "puta", "puto", "pico", "raja",
  "maricon", "mierda", "zorra", "perra", "verga", "pene", "sexo", "nazi", "hitler",
  "pichula", "tula", "coño", "cono", "violar",
];

const normalizar = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z]/g, "");

const apodoValido = (apodo) => {
  const n = normalizar(apodo);
  return !PALABRAS_BLOQUEADAS.some((p) => n.includes(normalizar(p)));
};

const colorEnemigo = (tipo) => {
  if (tipo === "zigzag") return COLORES.rojo;
  if (tipo === "blindado") return COLORES.amarillo;
  if (tipo === "tirador") return COLORES.rojo;
  return COLORES.magenta;
};

/* =====================================================================
   MOTOR DEL JUEGO (dibuja en un canvas, fuera de React por rendimiento)
   ===================================================================== */
function crearJuego(canvas, alTerminar) {
  const ctx = canvas.getContext("2d");
  let W = 0;
  let H = 0;
  let vivo = true;

  const ajustar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  ajustar();

  const crearEstrellas = () => {
    const capas = [];
    for (let c = 0; c < 3; c++) {
      const lista = [];
      const cantidad = 25 + c * 15;
      for (let i = 0; i < cantidad; i++) {
        lista.push({ x: Math.random() * W, y: Math.random() * H });
      }
      capas.push(lista);
    }
    return capas;
  };

  const e = {
    pausado: false,
    terminado: false,
    tiempo: 0,
    nivel: 1,
    puntaje: 0,
    vidas: VIDAS_INICIALES,
    arma: 1,
    escudoHasta: 0,
    rapidoHasta: 0,
    invulnerableHasta: 1500,
    ultimoDisparo: 0,
    proximoEnemigo: 900,
    proximaCaja: 7000,
    bannerNivelHasta: 1600,
    nave: { x: W / 2, y: H - 110, objetivoX: W / 2 },
    balas: [],
    enemigos: [],
    balasEnemigas: [],
    cajas: [],
    particulas: [],
    textos: [],
    estrellas: crearEstrellas(),
  };

  /* ---------- Control con el dedo ---------- */
  const mover = (ev) => {
    const r = canvas.getBoundingClientRect();
    e.nave.objetivoX = Math.max(20, Math.min(W - 20, ev.clientX - r.left));
  };
  canvas.addEventListener("pointerdown", mover);
  canvas.addEventListener("pointermove", mover);

  const alRedimensionar = () => {
    ajustar();
    e.nave.y = H - 110;
    e.nave.x = Math.max(20, Math.min(W - 20, e.nave.x));
    e.nave.objetivoX = Math.max(20, Math.min(W - 20, e.nave.objetivoX));
  };
  window.addEventListener("resize", alRedimensionar);

  /* ---------- Ayudantes ---------- */
  const explosion = (x, y, color, cantidad) => {
    for (let i = 0; i < cantidad; i++) {
      const ang = Math.random() * Math.PI * 2;
      const vel = 1 + Math.random() * 3.5;
      e.particulas.push({
        x, y, color,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel,
        vida: 400 + Math.random() * 300,
        vidaTotal: 700,
      });
    }
  };

  const textoFlotante = (x, y, texto, color) => {
    e.textos.push({ x, y, texto, color, hasta: e.tiempo + 1300 });
  };

  const sumarPuntos = (base) => {
    const puntos = Math.round(base * (1 + (e.nivel - 1) * 0.5));
    e.puntaje = Math.min(PUNTAJE_MAXIMO, e.puntaje + puntos);
  };

  const tiposDisponibles = () => {
    const tipos = ["simple"];
    if (e.nivel >= 3) tipos.push("zigzag");
    if (e.nivel >= 5) tipos.push("blindado");
    if (e.nivel >= 7) tipos.push("tirador");
    return tipos;
  };

  const crearEnemigo = () => {
    const tipos = tiposDisponibles();
    const tipo = tipos[Math.floor(Math.random() * tipos.length)];
    const vel = 1.4 + e.nivel * 0.22 + Math.random() * 0.6;
    const en = {
      tipo,
      x: 24 + Math.random() * (W - 48),
      y: -30,
      vy: vel,
      vida: 1,
      radio: 15,
      fase: Math.random() * Math.PI * 2,
      proximoTiro: 1200 + Math.random() * 800,
    };
    if (tipo === "zigzag") en.radio = 14;
    if (tipo === "blindado") { en.vida = 3; en.radio = 19; en.vy = vel * 0.65; }
    if (tipo === "tirador") { en.radio = 16; en.vy = vel * 0.55; }
    e.enemigos.push(en);
  };

  const disparar = () => {
    const x = e.nave.x;
    const y = e.nave.y - 22;
    const v = -9.5;
    if (e.arma === 1) {
      e.balas.push({ x, y, vx: 0, vy: v });
    } else if (e.arma === 2) {
      e.balas.push({ x: x - 8, y, vx: 0, vy: v });
      e.balas.push({ x: x + 8, y, vx: 0, vy: v });
    } else {
      e.balas.push({ x, y, vx: 0, vy: v });
      e.balas.push({ x: x - 6, y, vx: -2.2, vy: v });
      e.balas.push({ x: x + 6, y, vx: 2.2, vy: v });
    }
  };

  const darPremio = (x, y) => {
    const opciones = [];
    if (e.vidas < VIDAS_MAXIMAS) opciones.push("vida", "vida");
    if (e.arma < 3) opciones.push("arma", "arma");
    opciones.push("escudo", "rapido");
    const premio = opciones[Math.floor(Math.random() * opciones.length)];
    if (premio === "vida") {
      e.vidas++;
      textoFlotante(x, y, "+1 VIDA", COLORES.rojo);
    } else if (premio === "arma") {
      e.arma++;
      textoFlotante(x, y, e.arma === 2 ? "DISPARO DOBLE" : "DISPARO TRIPLE", COLORES.amarillo);
    } else if (premio === "escudo") {
      e.escudoHasta = e.tiempo + 8000;
      textoFlotante(x, y, "ESCUDO", COLORES.cian);
    } else {
      e.rapidoHasta = e.tiempo + 10000;
      textoFlotante(x, y, "DISPARO RÁPIDO", COLORES.magenta);
    }
  };

  const recibirGolpe = () => {
    if (e.tiempo < e.invulnerableHasta || e.tiempo < e.escudoHasta || e.terminado) return;
    e.vidas--;
    e.arma = Math.max(1, e.arma - 1);
    e.invulnerableHasta = e.tiempo + 1500;
    explosion(e.nave.x, e.nave.y, COLORES.cian, 20);
    try {
      if (navigator.vibrate) navigator.vibrate(120);
    } catch {
      // Sin vibración no pasa nada.
    }
    if (e.vidas <= 0) {
      e.terminado = true;
      explosion(e.nave.x, e.nave.y, COLORES.magenta, 40);
      setTimeout(() => {
        if (vivo) alTerminar({ puntaje: Math.round(e.puntaje), nivel: e.nivel });
      }, 1000);
    }
  };

  const actualizarParticulas = (dt, f) => {
    e.particulas.forEach((p) => {
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vida -= dt;
    });
    e.particulas = e.particulas.filter((p) => p.vida > 0);
    e.textos.forEach((t) => { t.y -= 0.6 * f; });
    e.textos = e.textos.filter((t) => t.hasta > e.tiempo);
  };

  /* ---------- Actualizar un cuadro ---------- */
  const actualizar = (dt) => {
    const f = dt / 16.67;
    e.tiempo += dt;

    const nuevoNivel = 1 + Math.floor(e.tiempo / (SEGUNDOS_POR_NIVEL * 1000));
    if (nuevoNivel !== e.nivel && !e.terminado) {
      e.nivel = nuevoNivel;
      e.bannerNivelHasta = e.tiempo + 1800;
    }

    // Estrellas: la capa cercana va más rápido y acelera con el nivel.
    e.estrellas.forEach((capa, c) => {
      const v = (0.6 + c * 1.1) * (1 + e.nivel * 0.12) * f;
      capa.forEach((s) => {
        s.y += v;
        if (s.y > H) {
          s.y -= H;
          s.x = Math.random() * W;
        }
      });
    });

    if (e.terminado) {
      actualizarParticulas(dt, f);
      return;
    }

    // Nave sigue al dedo con suavidad.
    e.nave.x += (e.nave.objetivoX - e.nave.x) * Math.min(1, 0.25 * f);

    // Disparo automático.
    const espera = e.tiempo < e.rapidoHasta ? 140 : 280;
    if (e.tiempo - e.ultimoDisparo >= espera) {
      disparar();
      e.ultimoDisparo = e.tiempo;
    }

    // Aparición de enemigos y cajas.
    e.proximoEnemigo -= dt;
    if (e.proximoEnemigo <= 0) {
      crearEnemigo();
      e.proximoEnemigo = Math.max(280, 1000 - e.nivel * 80) * (0.7 + Math.random() * 0.6);
    }
    e.proximaCaja -= dt;
    if (e.proximaCaja <= 0) {
      e.cajas.push({ x: 30 + Math.random() * (W - 60), y: -30, vy: 1.3, ang: 0, radio: 16 });
      e.proximaCaja = 8000 + Math.random() * 5000;
    }

    // Movimiento.
    e.balas.forEach((b) => { b.x += b.vx * f; b.y += b.vy * f; });
    e.enemigos.forEach((en) => {
      en.y += en.vy * f;
      if (en.tipo === "zigzag") {
        en.fase += 0.06 * f;
        en.x += Math.sin(en.fase) * 2.4 * f;
        en.x = Math.max(16, Math.min(W - 16, en.x));
      }
      if (en.tipo === "tirador") {
        en.proximoTiro -= dt;
        if (en.proximoTiro <= 0 && en.y > 0 && en.y < H * 0.7) {
          const dx = e.nave.x - en.x;
          const dy = e.nave.y - en.y;
          const d = Math.hypot(dx, dy) || 1;
          const v = 3.2 + e.nivel * 0.1;
          e.balasEnemigas.push({ x: en.x, y: en.y + 12, vx: (dx / d) * v, vy: (dy / d) * v });
          en.proximoTiro = 1400 + Math.random() * 900;
        }
      }
    });
    e.balasEnemigas.forEach((b) => { b.x += b.vx * f; b.y += b.vy * f; });
    e.cajas.forEach((c) => { c.y += c.vy * f; c.ang += 0.04 * f; });

    // Choques: balas contra enemigos y cajas.
    e.balas.forEach((b) => {
      if (b.muerta) return;
      for (const en of e.enemigos) {
        if (en.muerto) continue;
        if (Math.hypot(b.x - en.x, b.y - en.y) < en.radio + 4) {
          b.muerta = true;
          en.vida--;
          if (en.vida <= 0) {
            en.muerto = true;
            sumarPuntos(PUNTOS_POR_TIPO[en.tipo]);
            explosion(en.x, en.y, colorEnemigo(en.tipo), 14);
          } else {
            explosion(b.x, b.y, COLORES.amarillo, 4);
          }
          break;
        }
      }
      if (b.muerta) return;
      for (const c of e.cajas) {
        if (c.muerta) continue;
        if (Math.hypot(b.x - c.x, b.y - c.y) < c.radio + 4) {
          b.muerta = true;
          c.muerta = true;
          sumarPuntos(25);
          explosion(c.x, c.y, COLORES.verde, 16);
          darPremio(c.x, c.y);
          break;
        }
      }
    });

    // Choques contra la nave.
    const radioNave = 16;
    const conEscudo = e.tiempo < e.escudoHasta;
    e.enemigos.forEach((en) => {
      if (en.muerto) return;
      if (Math.hypot(en.x - e.nave.x, en.y - e.nave.y) < en.radio + radioNave) {
        en.muerto = true;
        explosion(en.x, en.y, colorEnemigo(en.tipo), 14);
        if (conEscudo) sumarPuntos(PUNTOS_POR_TIPO[en.tipo]);
        else recibirGolpe();
      }
    });
    e.balasEnemigas.forEach((b) => {
      if (Math.hypot(b.x - e.nave.x, b.y - e.nave.y) < radioNave) {
        b.muerta = true;
        if (!conEscudo) recibirGolpe();
      }
    });

    // Limpieza.
    e.balas = e.balas.filter((b) => !b.muerta && b.y > -20 && b.x > -20 && b.x < W + 20);
    e.enemigos = e.enemigos.filter((en) => !en.muerto && en.y < H + 40);
    e.balasEnemigas = e.balasEnemigas.filter((b) => !b.muerta && b.y < H + 20 && b.y > -20 && b.x > -20 && b.x < W + 20);
    e.cajas = e.cajas.filter((c) => !c.muerta && c.y < H + 40);

    actualizarParticulas(dt, f);
  };

  /* ---------- Dibujo ---------- */
  const dibujarNave = () => {
    const { x, y } = e.nave;
    if (e.terminado && e.vidas <= 0) return;
    const parpadeo = e.tiempo < e.invulnerableHasta && Math.floor(e.tiempo / 100) % 2 === 0;
    if (parpadeo) return;

    // Llama del motor.
    const largo = 10 + Math.random() * 8;
    ctx.fillStyle = COLORES.magenta;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 14);
    ctx.lineTo(x, y + 14 + largo);
    ctx.lineTo(x + 6, y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 14);
    ctx.lineTo(x, y + 14 + largo * 0.55);
    ctx.lineTo(x + 3, y + 14);
    ctx.closePath();
    ctx.fill();

    // Cuerpo.
    ctx.save();
    ctx.shadowColor = COLORES.cian;
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#0d1a26";
    ctx.strokeStyle = COLORES.cian;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 22);
    ctx.lineTo(x + 8, y - 4);
    ctx.lineTo(x + 18, y + 8);
    ctx.lineTo(x + 18, y + 14);
    ctx.lineTo(x + 7, y + 10);
    ctx.lineTo(x, y + 15);
    ctx.lineTo(x - 7, y + 10);
    ctx.lineTo(x - 18, y + 14);
    ctx.lineTo(x - 18, y + 8);
    ctx.lineTo(x - 8, y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Cabina.
    ctx.fillStyle = COLORES.magenta;
    ctx.beginPath();
    ctx.ellipse(x, y - 3, 3.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Escudo.
    if (e.tiempo < e.escudoHasta) {
      ctx.save();
      ctx.strokeStyle = "rgba(0,229,255,0.8)";
      ctx.lineWidth = 2;
      ctx.shadowColor = COLORES.cian;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, 28 + Math.sin(e.tiempo / 120) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  const dibujarEnemigo = (en) => {
    const { x, y } = en;
    const r = en.radio;
    const color = colorEnemigo(en.tipo);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(10,10,20,0.9)";
    ctx.beginPath();
    if (en.tipo === "simple") {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else if (en.tipo === "zigzag") {
      ctx.moveTo(x - r, y - r * 0.6);
      ctx.lineTo(x + r, y - r * 0.6);
      ctx.lineTo(x, y + r);
      ctx.closePath();
    } else if (en.tipo === "blindado") {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (en.tipo === "blindado") {
      ctx.fillStyle = COLORES.amarillo;
      for (let i = 0; i < en.vida; i++) ctx.fillRect(x - 8 + i * 6, y - 2, 4, 4);
    } else if (en.tipo === "tirador") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      const dx = e.nave.x - x;
      const dy = e.nave.y - y;
      const d = Math.hypot(dx, dy) || 1;
      ctx.fillStyle = COLORES.rojo;
      ctx.beginPath();
      ctx.arc(x + (dx / d) * 3, y + (dy / d) * 3, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const dibujarCaja = (c) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    ctx.shadowColor = COLORES.verde;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = COLORES.verde;
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(61,255,154,0.15)";
    ctx.fillRect(-c.radio, -c.radio, c.radio * 2, c.radio * 2);
    ctx.strokeRect(-c.radio, -c.radio, c.radio * 2, c.radio * 2);
    ctx.restore();
    ctx.fillStyle = COLORES.verde;
    ctx.font = `700 16px ${FUENTE}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", c.x, c.y + 1);
  };

  const dibujar = () => {
    ctx.fillStyle = "#05050a";
    ctx.fillRect(0, 0, W, H);

    // Estrellas (la capa cercana se estira como estela de velocidad).
    e.estrellas.forEach((capa, c) => {
      if (c === 2) ctx.fillStyle = "rgba(255,255,255,0.9)";
      else if (c === 1) ctx.fillStyle = "rgba(160,220,255,0.55)";
      else ctx.fillStyle = "rgba(200,160,255,0.3)";
      const tam = 1 + c * 0.6;
      const estela = c === 2 ? 2 + e.nivel * 0.5 : 0;
      capa.forEach((s) => ctx.fillRect(s.x, s.y, tam, tam + estela));
    });

    e.cajas.forEach(dibujarCaja);
    e.enemigos.forEach(dibujarEnemigo);

    // Balas propias.
    ctx.fillStyle = COLORES.cian;
    e.balas.forEach((b) => ctx.fillRect(b.x - 1.5, b.y - 6, 3, 12));

    // Balas enemigas.
    ctx.fillStyle = COLORES.rojo;
    e.balasEnemigas.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    dibujarNave();

    // Partículas.
    e.particulas.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.vida / p.vidaTotal);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    // Textos de premio.
    ctx.font = `800 14px ${FUENTE}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    e.textos.forEach((t) => {
      ctx.globalAlpha = Math.min(1, (t.hasta - e.tiempo) / 400);
      ctx.fillStyle = t.color;
      ctx.fillText(t.texto, t.x, t.y);
    });
    ctx.globalAlpha = 1;

    // Marcador.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 20px ${FUENTE}`;
    ctx.fillText(String(Math.round(e.puntaje)).padStart(6, "0"), 14, 16);
    ctx.font = `700 12px ${FUENTE}`;
    ctx.fillStyle = COLORES.cian;
    ctx.fillText(`NIVEL ${e.nivel}`, 14, 42);

    let yIndicador = 62;
    ctx.font = `700 11px ${FUENTE}`;
    if (e.arma > 1) {
      ctx.fillStyle = COLORES.amarillo;
      ctx.fillText(e.arma === 2 ? "ARMA x2" : "ARMA x3", 14, yIndicador);
      yIndicador += 16;
    }
    if (e.tiempo < e.escudoHasta) {
      ctx.fillStyle = COLORES.cian;
      ctx.fillText(`ESCUDO ${Math.ceil((e.escudoHasta - e.tiempo) / 1000)}s`, 14, yIndicador);
      yIndicador += 16;
    }
    if (e.tiempo < e.rapidoHasta) {
      ctx.fillStyle = COLORES.magenta;
      ctx.fillText(`RÁPIDO ${Math.ceil((e.rapidoHasta - e.tiempo) / 1000)}s`, 14, yIndicador);
    }

    // Vidas (debajo del botón Salir).
    ctx.textAlign = "right";
    ctx.font = `20px ${FUENTE}`;
    ctx.fillStyle = COLORES.rojo;
    ctx.fillText(CORAZON.repeat(Math.max(0, e.vidas)), W - 14, 56);

    // Aviso de nivel.
    if (e.tiempo < e.bannerNivelHasta && !e.terminado) {
      ctx.globalAlpha = Math.min(1, (e.bannerNivelHasta - e.tiempo) / 600);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 36px ${FUENTE}`;
      ctx.fillStyle = COLORES.magenta;
      ctx.fillText(`NIVEL ${e.nivel}`, W / 2, H * 0.38);
      ctx.globalAlpha = 1;
    }

    // Ayuda inicial.
    if (e.tiempo < 3500 && !e.terminado) {
      ctx.globalAlpha = Math.min(1, (3500 - e.tiempo) / 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 14px ${FUENTE}`;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText("Arrastra el dedo para mover la nave", W / 2, H - 40);
      ctx.globalAlpha = 1;
    }

    if (e.terminado) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 28px ${FUENTE}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText("FIN DE LA PARTIDA", W / 2, H * 0.42);
    }
  };

  /* ---------- Bucle principal ---------- */
  let ultimo = performance.now();
  let raf = 0;
  const bucle = (ahora) => {
    if (!vivo) return;
    const dt = Math.min(50, ahora - ultimo);
    ultimo = ahora;
    if (!e.pausado) actualizar(dt);
    dibujar();
    raf = requestAnimationFrame(bucle);
  };
  raf = requestAnimationFrame(bucle);

  return {
    pausar: () => { e.pausado = true; },
    reanudar: () => { e.pausado = false; ultimo = performance.now(); },
    estado: () => ({ puntaje: Math.round(e.puntaje), nivel: e.nivel }),
    terminarAhora: () => {
      e.pausado = false;
      if (!e.terminado) e.terminado = true;
      return { puntaje: Math.round(e.puntaje), nivel: e.nivel };
    },
    destruir: () => {
      vivo = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", mover);
      canvas.removeEventListener("pointermove", mover);
      window.removeEventListener("resize", alRedimensionar);
    },
  };
}

/* =====================================================================
   COMPONENTE (pantallas de aviso, apodo y ranking)
   ===================================================================== */
export default function MiniJuego({ eventoId, estadoFoto, onVerFoto, onCerrar }) {
  const canvasRef = useRef(null);
  const juegoRef = useRef(null);
  const avisoMostradoRef = useRef(false);

  // jugando | aviso-foto | apodo | ranking
  const [pantalla, setPantalla] = useState("jugando");
  const [partida, setPartida] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [puntajePausa, setPuntajePausa] = useState(0);
  const [apodo, setApodo] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_APODO) || "";
    } catch {
      return "";
    }
  });
  const [errorApodo, setErrorApodo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [ranking, setRanking] = useState(null);

  const fotoTerminada = estadoFoto === "lista" || estadoFoto === "error";
  const fotoConError = estadoFoto === "error";

  // Evita que la página de fondo se mueva mientras se juega.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; };
  }, []);

  // Crea una partida nueva cada vez que cambia "partida".
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const juego = crearJuego(canvas, (res) => {
      setResultado(res);
      setPantalla("apodo");
    });
    juegoRef.current = juego;
    return () => {
      juego.destruir();
      juegoRef.current = null;
    };
  }, [partida]);

  // Foto lista (o con error) mientras se juega: pausa y pregunta.
  useEffect(() => {
    if (!fotoTerminada || avisoMostradoRef.current || pantalla !== "jugando") return;
    avisoMostradoRef.current = true;
    juegoRef.current?.pausar();
    setPuntajePausa(juegoRef.current?.estado()?.puntaje || 0);
    setPantalla("aviso-foto");
  }, [fotoTerminada, pantalla]);

  const seguirJugando = () => {
    setPantalla("jugando");
    juegoRef.current?.reanudar();
  };

  const terminarPartida = () => {
    const res = juegoRef.current?.terminarAhora() || { puntaje: 0, nivel: 1 };
    setResultado(res);
    setPantalla("apodo");
  };

  const cargarRanking = async (miId, miPuntaje) => {
    const { data } = await supabase
      .from("puntajes")
      .select("id, apodo, puntaje, nivel")
      .eq("evento_id", eventoId)
      .order("puntaje", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(5);
    const top = data || [];
    let miPosicion = null;
    if (miId) {
      const indice = top.findIndex((r) => r.id === miId);
      if (indice >= 0) {
        miPosicion = indice + 1;
      } else {
        const { count } = await supabase
          .from("puntajes")
          .select("id", { count: "exact", head: true })
          .eq("evento_id", eventoId)
          .gt("puntaje", miPuntaje);
        miPosicion = (count || 0) + 1;
      }
    }
    setRanking({ top, miId, miPosicion, miPuntaje });
    setPantalla("ranking");
  };

  const guardarPuntaje = async () => {
    const limpio = apodo.trim();
    if (!limpio) { setErrorApodo("Escribe un apodo"); return; }
    if (!apodoValido(limpio)) { setErrorApodo("Ese apodo no está permitido, elige otro"); return; }
    setGuardando(true);
    setErrorApodo("");
    try {
      try {
        localStorage.setItem(CLAVE_APODO, limpio);
      } catch {
        // Si no se puede recordar el apodo, no pasa nada.
      }
      const puntaje = Math.min(PUNTAJE_MAXIMO, Math.max(0, resultado?.puntaje || 0));
      const nivel = Math.min(100, Math.max(1, resultado?.nivel || 1));
      const { data, error } = await supabase
        .from("puntajes")
        .insert({ evento_id: eventoId, apodo: limpio, puntaje, nivel })
        .select("id")
        .single();
      if (error) throw error;
      await cargarRanking(data?.id, puntaje);
    } catch {
      setErrorApodo("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const noGuardar = async () => {
    setGuardando(true);
    try {
      await cargarRanking(null, 0);
    } catch {
      setRanking({ top: [], miId: null, miPosicion: null, miPuntaje: 0 });
      setPantalla("ranking");
    } finally {
      setGuardando(false);
    }
  };

  const jugarDeNuevo = () => {
    setResultado(null);
    setRanking(null);
    setErrorApodo("");
    setPantalla("jugando");
    setPartida((p) => p + 1);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#05050a" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      />

      {pantalla === "jugando" && (
        <button
          onClick={terminarPartida}
          style={{
            position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", right: 12,
            padding: "7px 14px", borderRadius: 100, cursor: "pointer",
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
            color: "#ffffff", fontSize: 13, fontWeight: 600, fontFamily: FUENTE,
          }}
        >
          Salir
        </button>
      )}

      {/* --- Foto lista mientras se juega --- */}
      {pantalla === "aviso-foto" && (
        <Panel>
          <Emoji>{fotoConError ? EMOJI_ALERTA : EMOJI_FIESTA}</Emoji>
          <h2 className="display" style={{ fontSize: 21, marginBottom: 8 }}>
            {fotoConError ? "Hubo un problema con tu foto" : "¡Tu foto está lista!"}
          </h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>
            Llevas {puntajePausa.toLocaleString("es-CL")} puntos. ¿Qué quieres hacer?
          </p>
          <BotonPrincipal onClick={terminarPartida}>
            {fotoConError ? "Ver qué pasó" : "Ver mi foto ahora"}
          </BotonPrincipal>
          <BotonSecundario onClick={seguirJugando}>Seguir jugando</BotonSecundario>
          <p style={{ color: "var(--text-faint)", fontSize: 11.5, lineHeight: 1.5, marginTop: 10 }}>
            Si sigues jugando, al terminar la partida te llevamos a tu foto.
          </p>
        </Panel>
      )}

      {/* --- Fin de la partida: apodo --- */}
      {pantalla === "apodo" && (
        <Panel>
          <Emoji>{EMOJI_COHETE}</Emoji>
          <div className="eyebrow" style={{ color: "var(--magenta)", marginBottom: 6 }}>Fin de la partida</div>
          <div style={{
            fontSize: 40, fontWeight: 900, fontFamily: FUENTE, lineHeight: 1.1,
            background: "linear-gradient(90deg, var(--cyan), var(--magenta))",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>
            {(resultado?.puntaje || 0).toLocaleString("es-CL")}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 4, marginBottom: 18 }}>
            puntos · nivel {resultado?.nivel || 1}
          </div>

          {fotoTerminada && (
            <div style={{
              fontSize: 12, color: "var(--cyan)", marginBottom: 14,
              padding: "8px 12px", borderRadius: 10, background: "rgba(0,229,255,0.08)",
            }}>
              {fotoConError ? "Tu foto tuvo un problema, la revisas al salir." : "Tu foto ya está lista."}
            </div>
          )}

          <input
            className="input"
            value={apodo}
            maxLength={12}
            placeholder="Tu apodo"
            onChange={(ev) => { setApodo(ev.target.value); setErrorApodo(""); }}
            onKeyDown={(ev) => ev.key === "Enter" && guardarPuntaje()}
            style={{ textAlign: "center", fontSize: 16 }}
          />
          {errorApodo && (
            <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{errorApodo}</div>
          )}
          <BotonPrincipal onClick={guardarPuntaje} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar puntaje"}
          </BotonPrincipal>
          <BotonSecundario onClick={noGuardar} disabled={guardando}>No guardar</BotonSecundario>
        </Panel>
      )}

      {/* --- Ranking top 5 del evento --- */}
      {pantalla === "ranking" && ranking && (
        <Panel>
          <Emoji>{EMOJI_TROFEO}</Emoji>
          <h2 className="display" style={{ fontSize: 21, marginBottom: 16 }}>Top 5 del evento</h2>

          {ranking.top.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginBottom: 16 }}>
              Todavía no hay puntajes. ¡Sé el primero!
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {ranking.top.map((r, i) => (
                <FilaRanking
                  key={r.id}
                  posicion={i + 1}
                  apodo={r.apodo}
                  puntaje={r.puntaje}
                  esMio={r.id === ranking.miId}
                />
              ))}
            </div>
          )}

          {ranking.miId && ranking.miPosicion > 5 && (
            <>
              <div style={{ color: "var(--text-faint)", fontSize: 12, margin: "2px 0 8px" }}>Tu posición</div>
              <FilaRanking
                posicion={ranking.miPosicion}
                apodo={apodo.trim() || "Tú"}
                puntaje={ranking.miPuntaje}
                esMio
              />
            </>
          )}

          <div style={{ marginTop: 10 }}>
            {fotoTerminada ? (
              <BotonPrincipal onClick={onVerFoto}>
                {fotoConError ? "Ver qué pasó con mi foto" : "Ver mi foto"}
              </BotonPrincipal>
            ) : (
              <>
                <BotonPrincipal onClick={jugarDeNuevo}>Jugar de nuevo</BotonPrincipal>
                <BotonSecundario onClick={onCerrar}>Volver a la espera</BotonSecundario>
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ---------- Piezas visuales ---------- */

function Panel({ children }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(5,5,10,0.7)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <style>{`@keyframes nexoPanel { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
      <div style={{
        width: "100%", maxWidth: 360, maxHeight: "92vh", overflowY: "auto",
        background: "linear-gradient(160deg, #16162a 0%, #0d0d16 100%)",
        border: "1px solid rgba(224,64,251,0.45)", borderRadius: 22,
        padding: "24px 20px 20px", textAlign: "center",
        boxShadow: "0 0 60px rgba(224,64,251,0.18), 0 20px 50px rgba(0,0,0,0.5)",
        animation: "nexoPanel 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both",
      }}>
        {children}
      </div>
    </div>
  );
}

function Emoji({ children }) {
  return (
    <div style={{
      width: 62, height: 62, borderRadius: "50%", margin: "0 auto 14px",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
      background: "radial-gradient(circle, rgba(224,64,251,0.28), rgba(0,229,255,0.08))",
      boxShadow: "0 0 26px rgba(224,64,251,0.3), 0 0 0 1px rgba(224,64,251,0.4)",
    }}>
      {children}
    </div>
  );
}

function BotonPrincipal({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", marginTop: 12, padding: "13px 16px", borderRadius: 14, border: "none",
      cursor: disabled ? "wait" : "pointer", fontSize: 15, fontWeight: 700,
      fontFamily: "var(--font-body)", color: "#0a0a0f", opacity: disabled ? 0.6 : 1,
      background: "linear-gradient(90deg, var(--cyan), var(--magenta))",
      boxShadow: "0 0 24px rgba(0,229,255,0.25)",
    }}>
      {children}
    </button>
  );
}

function BotonSecundario({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", marginTop: 8, padding: "12px 16px", borderRadius: 14,
      cursor: disabled ? "wait" : "pointer", fontSize: 14, fontWeight: 600,
      fontFamily: "var(--font-body)", color: "var(--text)", opacity: disabled ? 0.6 : 1,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)",
    }}>
      {children}
    </button>
  );
}

function FilaRanking({ posicion, apodo, puntaje, esMio }) {
  const medalla = posicion <= 3 ? MEDALLAS[posicion - 1] : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12,
      background: esMio ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${esMio ? "var(--cyan)" : "rgba(255,255,255,0.07)"}`,
    }}>
      <div style={{ width: 30, fontSize: medalla ? 20 : 14, fontWeight: 800, color: "var(--text-dim)", textAlign: "center" }}>
        {medalla || `#${posicion}`}
      </div>
      <div style={{ flex: 1, textAlign: "left", fontSize: 14, color: "var(--text)", fontWeight: esMio ? 700 : 500 }}>
        {apodo}{esMio ? " (tú)" : ""}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: esMio ? "var(--cyan)" : "var(--text)" }}>
        {Number(puntaje).toLocaleString("es-CL")}
      </div>
    </div>
  );
}