// api/generarFoto.js
//
// PASO 1 del flujo de 2 pasos. Esta función SOLO crea la tarea en WaveSpeed
// y devuelve el taskId de inmediato — no espera el resultado. Así nunca se
// acerca al límite de 60s de Vercel, sin importar cuánto tarde WaveSpeed en
// generar la imagen.
//
// El frontend, después de recibir el taskId, llama repetidamente a
// api/consultarFoto.js (cada ~3 seg) hasta que la imagen esté lista.
//
// NOTA: cada llamada a este endpoint elige UNA variante al azar dentro del
// modo pedido (via getPromptAleatorio en lib/prompts.js). Si el invitado da
// "Probar otra vez", recibirá una variante distinta del mismo modo.

const { createClient } = require('@supabase/supabase-js');
const { getPromptAleatorio, DOMINIO_BASE } = require('../lib/prompts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { fotoUrl, modo, eventoId } = req.body || {};

  if (!fotoUrl || !modo || !eventoId) {
    return res.status(400).json({
      error: 'Faltan datos: se requiere fotoUrl, modo y eventoId',
    });
  }

  // Elige una variante al azar del modo pedido.
  // Devuelve siempre { prompt, refFija? } o null si el modo no existe.
  const variante = getPromptAleatorio(modo);
  if (!variante) {
    return res.status(400).json({
      error: `El modo "${modo}" todavía no está disponible`,
    });
  }

  const { prompt, refFija } = variante;

  const imagenesParaWaveSpeed = refFija
    ? [fotoUrl, `${DOMINIO_BASE}/referencias/${refFija}`]
    : [fotoUrl];

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // ---------------------------------------------------------------------
  // Control de acceso: IA habilitada + cuota del evento, igual que antes.
  // ---------------------------------------------------------------------
  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('cuota_ia, ia_habilitada')
    .eq('id', eventoId)
    .single();

  if (errorEvento) {
    return res.status(500).json({ error: 'No se pudo verificar el evento' });
  }

  if (evento?.ia_habilitada === false) {
    return res.status(403).json({
      error: 'FUNphoto IA no está disponible para este evento',
    });
  }

  if (evento?.cuota_ia !== null && evento?.cuota_ia !== undefined) {
    const { count, error: errorConteo } = await supabase
      .from('fotos')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', eventoId)
      .eq('es_ia', true);

    if (errorConteo) {
      return res.status(500).json({ error: 'No se pudo verificar la cuota de fotos IA' });
    }

    if (count >= evento.cuota_ia) {
      return res.status(403).json({
        error: 'Se alcanzó el límite de fotos IA disponibles para este evento',
      });
    }
  }

  try {
    // ---------------------------------------------------------------------
    // Solo CREA la tarea — no espera el resultado.
    // ---------------------------------------------------------------------
    const creacion = await fetch(
      'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit',
      {
        method: