// api/operador.js
//
// Acciones del panel de operador, validadas en el servidor.
// Cada llamada trae eventoId + clave del evento. Si viene una sesión de
// admin (Supabase Auth) en el encabezado Authorization, no se pide clave.
//
// Acciones:
// - login:        valida la clave
// - registrar:    guarda nombre y RUT del operador
// - estado:       aprueba / rechaza / devuelve a revisión fotos del evento
// - autoAprobar:  enciende o apaga la aprobación automática
// - mensaje:      cambia el texto del botón de subida

const { createClient } = require('@supabase/supabase-js');

const ESTADOS_VALIDOS = ['approved', 'rejected', 'pending'];
const MAX_MENSAJE = 60;
const MAX_IDS = 200;

// Validación de RUT chileno (misma lógica que en la app).
function validarRut(rut) {
  const limpio = String(rut || '').replace(/\./g, '').trim();
  if (!/^\d{7,8}-[\dkK]$/.test(limpio)) return null;
  const [cuerpo, dv] = limpio.split('-');
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const esperado = 11 - (suma % 11);
  const dvCalc = esperado === 11 ? '0' : esperado === 10 ? 'K' : String(esperado);
  return dv.toUpperCase() === dvCalc ? limpio.toUpperCase() : null;
}

// Revisa si la llamada trae una sesión válida de admin.
async function esAdmin(supabase, req) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
  if (!token) return false;
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data?.user;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { accion, eventoId, clave } = req.body || {};
  if (!accion || !eventoId) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('id, clave_operador, evento_cerrado, session_version')
    .eq('id', eventoId)
    .maybeSingle();

  if (errorEvento || !evento) {
    return res.status(404).json({ error: 'Evento no encontrado' });
  }

  const admin = await esAdmin(supabase, req);
  if (!admin) {
    if (evento.evento_cerrado) {
      return res.status(403).json({ error: 'Este evento está cerrado. Contacta al administrador.' });
    }
    if (!clave || clave !== evento.clave_operador) {
      return res.status(401).json({ error: 'Clave incorrecta' });
    }
  }

  try {
    if (accion === 'login') {
      return res.status(200).json({ ok: true, sessionVersion: evento.session_version || 1 });
    }

    if (accion === 'registrar') {
      const nombre = String(req.body.nombre || '').trim();
      const rut = validarRut(req.body.rut);
      if (nombre.length < 2 || nombre.length > 80) {
        return res.status(400).json({ error: 'Escribe tu nombre completo' });
      }
      if (!rut) {
        return res.status(400).json({ error: 'RUT inválido. Usa: 12345678-9 (sin puntos, con guión)' });
      }
      const { error } = await supabase
        .from('operadores')
        .insert({ evento_id: eventoId, nombre, rut });
      if (error) throw error;
      return res.status(200).json({ ok: true, sessionVersion: evento.session_version || 1 });
    }

    if (accion === 'estado') {
      const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, MAX_IDS) : [];
      const status = req.body.status;
      if (!ids.length || !ESTADOS_VALIDOS.includes(status)) {
        return res.status(400).json({ error: 'Datos inválidos' });
      }
      const { error } = await supabase
        .from('fotos')
        .update({ status })
        .eq('evento_id', eventoId)
        .neq('status', 'borrador')
        .in('id', ids);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (accion === 'autoAprobar') {
      const valor = req.body.valor === true;
      const { error } = await supabase
        .from('eventos')
        .update({ auto_aprobar: valor })
        .eq('id', eventoId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (accion === 'mensaje') {
      const texto = String(req.body.texto || '').trim().slice(0, MAX_MENSAJE);
      if (!texto) {
        return res.status(400).json({ error: 'Escribe un mensaje' });
      }
      const { error } = await supabase
        .from('eventos')
        .update({ mensaje_subida: texto })
        .eq('id', eventoId);
      if (error) throw error;
      return res.status(200).json({ ok: true, texto });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  } catch (error) {
    console.error('Error en operador:', error);
    return res.status(500).json({ error: 'No se pudo completar la acción' });
  }
};