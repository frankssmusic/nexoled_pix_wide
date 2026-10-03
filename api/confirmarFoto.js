// api/confirmarFoto.js
//
// "Usar esta foto" del Asistente. Pasa una foto IA de BORRADOR a
// aprobada o en espera, según la aprobación automática del evento.
// La decisión la toma el servidor, no el celular del invitado.

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { fotoId, eventoId } = req.body || {};
  if (!fotoId || !eventoId) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  try {
    const { data: foto, error: errorFoto } = await supabase
      .from('fotos')
      .select('id, status')
      .eq('id', fotoId)
      .eq('evento_id', eventoId)
      .maybeSingle();

    if (errorFoto || !foto) {
      return res.status(404).json({ error: 'No se encontró la foto' });
    }
    if (foto.status !== 'borrador') {
      return res.status(409).json({ error: 'Esta foto ya fue confirmada' });
    }

    const { data: evento, error: errorEvento } = await supabase
      .from('eventos')
      .select('auto_aprobar, evento_cerrado')
      .eq('id', eventoId)
      .maybeSingle();

    if (errorEvento || !evento) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }
    if (evento.evento_cerrado) {
      return res.status(403).json({ error: 'Este evento ya cerró' });
    }

    const directo = evento.auto_aprobar === true;
    const { error: errorUpdate } = await supabase
      .from('fotos')
      .update({ status: directo ? 'approved' : 'pending' })
      .eq('id', fotoId)
      .eq('status', 'borrador');

    if (errorUpdate) throw errorUpdate;

    return res.status(200).json({ ok: true, directo });
  } catch (error) {
    console.error('Error en confirmarFoto:', error);
    return res.status(500).json({ error: 'No se pudo confirmar la foto' });
  }
};