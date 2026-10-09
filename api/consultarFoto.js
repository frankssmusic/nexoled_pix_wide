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
// y devolvemos { listo: true, foto }.
//
// COSTOS (Oct 2026): el costo por foto se lee de la tabla `configuracion`
// (precios editables desde el Admin). Si no se puede leer, usa los de respaldo.
// Tiers: base (Seedream), pro (GPT Image 2.5 Flare), premium (GPT Image 2).

const { createClient } = require('@supabase/supabase-js');

// Costos de respaldo (US$ por foto) si no se puede leer la configuración.
// Pro usa el caso más caro de Flare (2 imágenes de referencia).
const COSTOS_RESPALDO = { base: 0.045, pro: 0.054, premium: 0.08 };

// Qué precio corresponde a cada motor.
const TIPO_POR_MOTOR = {
  seedream_4_5: 'base',
  seedream_5_0: 'base',
  gpt_image_flare: 'pro',
  gpt_image_medium: 'premium',
};

// Lee los precios vigentes desde la tabla configuracion.
async function leerCostos(supabase) {
  try {
    const { data, error } = await supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['costo_base_usd', 'costo_pro_usd', 'costo_premium_usd']);
    if (error || !data) return COSTOS_RESPALDO;
    const mapa = {};
    data.forEach((f) => { mapa[f.clave] = Number(f.valor); });
    return {
      base: mapa.costo_base_usd > 0 ? mapa.costo_base_usd : COSTOS_RESPALDO.base,
      pro: mapa.costo_pro_usd > 0 ? mapa.costo_pro_usd : COSTOS_RESPALDO.pro,
      premium: mapa.costo_premium_usd > 0 ? mapa.costo_premium_usd : COSTOS_RESPALDO.premium,
    };
  } catch {
    return COSTOS_RESPALDO;
  }
}

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
      // Sigue "processing" o "pending": el frontend vuelve a preguntar.
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

    // Costo de esta generación según el motor usado y los precios vigentes.
    // Si no llega motorUsado, queda null y el registro se guarda igual.
    let costoEstimado = null;
    if (motorUsado && TIPO_POR_MOTOR[motorUsado]) {
      const costos = await leerCostos(supabase);
      costoEstimado = costos[TIPO_POR_MOTOR[motorUsado]];
    }

    // Registrar la foto como BORRADOR: el operador no la ve hasta que el
    // invitado confirme con "Usar esta foto".
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
};