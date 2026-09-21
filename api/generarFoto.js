// api/generarFoto.js
//
// PASO 1 del flujo de 2 pasos. Esta funcion SOLO crea la tarea en WaveSpeed
// y devuelve el taskId de inmediato -- no espera el resultado. Asi nunca se
// acerca al limite de 60s de Vercel, sin importar cuanto tarde WaveSpeed en
// generar la imagen.
//
// El frontend, despues de recibir el taskId, llama repetidamente a
// api/consultarFoto.js (cada ~3 seg) hasta que la imagen este lista.
//
// NOTA: cada llamada a este endpoint elige UNA variante al azar dentro del
// modo pedido (via getPromptAleatorio en lib/prompts.js). Si el invitado da
// "Probar otra vez", recibira una variante distinta del mismo modo.

const { createClient } = require('@supabase/supabase-js');
const { getPromptAleatorio, DOMINIO_BASE } = require('../lib/prompts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const { fotoUrl, modo, eventoId } = req.body || {};

  if (!fotoUrl || !modo || !eventoId) {
    return res.status(400).json({
      error: 'Faltan datos: se requiere fotoUrl, modo y eventoId',
    });
  }

  const variante = getPromptAleatorio(modo);
  if (!variante) {
    return res.status(400).json({
      error: `El modo "${modo}" todavia no esta disponible`,
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
      error: 'FUNphoto IA no esta disponible para este evento',
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
        error: 'Se alcanzo el limite de fotos IA disponibles para este evento',
      });
    }
  }

  try {
    const creacion = await fetch(
      'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          images: imagenesParaWaveSpeed,
          prompt: prompt,
          size: '1080*1920',
        }),
      }
    );

    if (!creacion.ok) {
      const textoError = await creacion.text();
      throw new Error(`WaveSpeed rechazo la solicitud: ${textoError}`);
    }

    const tareaCreada = await creacion.json();
    const taskId = tareaCreada?.data?.id || tareaCreada?.id;

    if (!taskId) {
      throw new Error('WaveSpeed no devolvio un ID de tarea valido');
    }

    return res.status(200).json({
      success: true,
      taskId,
      modo,
      eventoId,
    });
  } catch (error) {
    console.error('Error en generarFoto:', error);
    return res.status(500).json({
      error: error.message || 'Error creando la tarea de generacion',
    });
  }
}