// api/borrarFotosViejas.js
//
// Borrado automático de fotos de selfiA.
// Vercel ejecuta esta función sola una vez al día (configurado en vercel.json).
//
// Qué hace:
// 1. Busca en la tabla `fotos` las filas con más de 72 horas (created_at).
// 2. Borra sus archivos del bucket `fotos` de Supabase Storage.
// 3. Borra esas filas de la tabla.
//
// Solo toca archivos que aparecen en la tabla `fotos`. Cualquier otro archivo
// del bucket (escenas Especiales, logos, etc.) no se toca.

const { createClient } = require('@supabase/supabase-js');

const HORAS_DE_VIDA = 72;
const FOTOS_POR_TANDA = 500;
const MAX_TANDAS = 20; // tope de seguridad: hasta 10.000 fotos por día

// Saca la ruta del archivo dentro del bucket a partir de la URL pública.
// Ejemplo: https://xxx.supabase.co/storage/v1/object/public/fotos/ia_modo_123.jpg
//          -> ia_modo_123.jpg
function extraerRuta(url) {
  if (!url) return null;
  const marca = '/object/public/fotos/';
  const posicion = url.indexOf(marca);
  if (posicion === -1) return null;
  const ruta = url.substring(posicion + marca.length).split('?')[0];
  try {
    return decodeURIComponent(ruta);
  } catch (e) {
    return ruta;
  }
}

module.exports = async function handler(req, res) {
  // Seguridad: solo Vercel (que conoce el CRON_SECRET) puede ejecutar esto.
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const fechaLimite = new Date(
    Date.now() - HORAS_DE_VIDA * 60 * 60 * 1000
  ).toISOString();

  let filasBorradas = 0;
  let archivosBorrados = 0;
  const errores = [];

  for (let tanda = 0; tanda < MAX_TANDAS; tanda++) {
    // 1. Buscar fotos viejas
    const { data: fotos, error: errorBusqueda } = await supabase
      .from('fotos')
      .select('id, url')
      .lt('created_at', fechaLimite)
      .limit(FOTOS_POR_TANDA);

    if (errorBusqueda) {
      errores.push(`Error buscando fotos: ${errorBusqueda.message}`);
      break;
    }

    if (!fotos || fotos.length === 0) break; // no quedan fotos viejas

    // 2. Borrar los archivos del bucket
    const rutas = fotos.map((f) => extraerRuta(f.url)).filter(Boolean);

    if (rutas.length > 0) {
      const { data: borrados, error: errorStorage } = await supabase.storage
        .from('fotos')
        .remove(rutas);

      if (errorStorage) {
        errores.push(`Error borrando archivos: ${errorStorage.message}`);
        break;
      }

      // Si no se borró ningún archivo, lo más probable es que falte permiso.
      // Paramos aquí para NO borrar las filas y dejar archivos huérfanos.
      if (!borrados || borrados.length === 0) {
        errores.push(
          'No se borró ningún archivo del bucket (posible falta de permiso). No se borraron filas.'
        );
        break;
      }

      archivosBorrados += borrados.length;
    }

    // 3. Borrar las filas de la tabla
    const ids = fotos.map((f) => f.id);
    const { error: errorFilas } = await supabase
      .from('fotos')
      .delete()
      .in('id', ids);

    if (errorFilas) {
      errores.push(`Error borrando filas: ${errorFilas.message}`);
      break;
    }

    filasBorradas += ids.length;
  }

  const resumen = {
    ok: errores.length === 0,
    fechaLimite,
    filasBorradas,
    archivosBorrados,
    errores,
  };

  console.log('Borrado automático selfiA:', JSON.stringify(resumen));

  return res.status(errores.length === 0 ? 200 : 500).json(resumen);
};