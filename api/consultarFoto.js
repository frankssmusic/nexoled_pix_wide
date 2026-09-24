// api/consultarFoto.js
//
// PASO 2 del flujo de 2 pasos. El frontend llama a este endpoint cada ~3
// segundos, pasando el taskId que devolvió api/generarFoto.js. Cada llamada
// es rápida (1-3 seg): solo pregunta a WaveSpeed "¿ya terminaste?".
//
// Si WaveSpeed responde "processing" -> devolvemos { listo: false } y el
// frontend vuelve a preguntar más tarde.
//
// Si WaveSpeed responde "completed" -> ahí SÍ hacemos el trabajo pesado
// (descargar la imagen, subirla a Supabase, crear el registro en `fotos`)
// y devolvemos { listo: true, foto }. Como la imagen ya está lista en ese
// momento, este paso final es rápido (unos segundos), muy lejos del límite
// de 60s de Vercel.
//
// NOTA (Sept 2026): ahora recibe motorUsado (que generarFoto.js le pasó al
// frontend) y lo guarda en fotos.motor_usado + calcula fotos.costo_estimado
// según ese motor. Esto alimenta el futuro dashboard de consumo/costos.

const { createClient } = require('@supabase/supabase-js');

// Costo real por foto según el motor — debe coincidir con los precios
// definidos en api/generarFoto.js (MOTORES).
const COSTOS_POR_MOTOR = {
  seedream_4_5: 0.045,
  seedream_5_0: 0.045,
  gpt_image_medium: 0.0665,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { taskId, modo, eventoId, motorUsado } = req.body || {};

  if (!taskId || !modo || !eventoId) {
    return res.status(400).json({
      error: 'Faltan datos: se requiere taskId, modo y eventoId',
    });
  }

  try {
    const estado = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
        },
      }
    );

    const estadoJson = await estado.json();
    const status = estadoJson?.data?.status || estadoJson?.status;

    if (status === 'failed') {
      return res.status(500).json({ error: 'WaveSpeed no pudo generar la imagen' });
    }

    if (status !== 'completed' && status !== 'succeeded') {
      // Sigue "processing" o "pending" — el frontend vuelve a preguntar.
      return res.status(200).json({ listo: false });
    }

    // ---------------------------------------------------------------------
    // Ya está lista. Descargamos la imagen y la subimos a Supabase Storage.
    // ---------------------------------------------------------------------
    const urlResultado =
      estadoJson?.data?.outputs?.[0] ||
      estadoJson?.outputs?.[0] ||
      estadoJson?.data?.output;

    if (!urlResultado) {
      return res.status(500).json({ error: 'WaveSpeed no devolvió una imagen válida' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const imagenDescargada = await fetch(urlResultado);
    const imagenBuffer = await imagenDescargada.arrayBuffer();

    const nombreArchivo = `ia_${modo}_${eventoId}_${Date.now()}.jpg`;

    const { error: errorSubida } = await supabase.storage
      .from('fotos')
      .upload(nombreArchivo, Buffer.from(imagenBuffer), {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (errorSubida) {
      throw new Error(`No se pudo subir la imagen a Supabase: ${errorSubida.message}`);
    }

    const { data: urlPublica } = supabase.storage
      .from('fotos')
      .getPublicUrl(nombreArchivo);

    // Costo real de esta generación, según qué motor se usó.
    // Si por algún motivo no llega motorUsado (llamada vieja o error),
    // no rompe nada: queda null y el registro se guarda igual.
    const costoEstimado = motorUsado ? (COSTOS_POR_MOTOR[motorUsado] ?? null) : null;

    // Registrar la foto como BORRADOR (igual que antes) — el operador no la
    // ve hasta que el invitado confirme con "Usar esta foto".
    const { data: fotoCreada, error: errorInsert } = await supabase
      .from('fotos')
      .insert({
        evento_id: eventoId,
        url: urlPublica.publicUrl,
        status: 'borrador',
        autorizada: false,
        es_ia: true,
        modo_ia: modo,
        motor_usado: motorUsado || null,
        costo_estimado: costoEstimado,
      })
      .select()
      .single();

    if (errorInsert) {
      throw new Error(`No se pudo registrar la foto: ${errorInsert.message}`);
    }

    return res.status(200).json({
      listo: true,
      foto: fotoCreada,
      costoAprox: costoEstimado,
    });
  } catch (error) {
    console.error('Error en consultarFoto:', error);
    return res.status(500).json({
      error: error.message || 'Error consultando el estado de la generación',
    });
  }
}