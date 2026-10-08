/**
 * AquaChile - Solicitud de Evaluación Psicolaboral
 *
 * Este archivo crea el Google Form y, mediante un trigger, prepara el envío
 * de cada respuesta hacia el backend de AquaChile.
 *
 * IMPORTANTE:
 * - El endpoint /api/solicitudes/desde-form todavía debe implementarse en el backend.
 * - NO pongas DATABASE_URL ni contraseñas de Neon aquí.
 * - WEBHOOK_URL y WEBHOOK_TOKEN se configurarán cuando el backend esté publicado.
 *
 * USO:
 * 1) Ve a https://script.google.com -> Nuevo proyecto.
 * 2) Pega este archivo.
 * 3) Edita ANALISTAS y las opciones si corresponde.
 * 4) Ejecuta crearFormulario() y autoriza los permisos.
 * 5) Revisa el registro de ejecución para obtener el enlace del formulario.
 * 6) En Propiedades del script agrega:
 *      WEBHOOK_URL   = https://TU-BACKEND.com/api/solicitudes/desde-form
 *      WEBHOOK_TOKEN = una clave larga inventada
 * 7) Ejecuta instalarTrigger() una sola vez.
 */

const ANALISTAS = ['Camila Muñoz', 'Analista 2', 'Analista 3'];

const FAMILIAS_CARGO = [
  'Profesional A', 'Profesional B C', 'Técnico A', 'Técnico B C',
  'Operario Calificado', 'Supervisor B', 'Jefatura'
];

const UNIDADES = [
  'Corporativo', 'Industrial', 'Otros Producción', 'Producción AM', 'Producción AD'
];

// Clave interna de cada pregunta. El backend usará estas claves.
const PREGUNTAS = [
  { key: 'analista', titulo: 'Analista solicitante', tipo: 'lista', opciones: ANALISTAS, req: true },
  { key: 'nombre', titulo: 'Nombre del candidato/a', tipo: 'texto', req: true },
  { key: 'correo', titulo: 'Correo electrónico del candidato/a', tipo: 'email', req: true },
  { key: 'telefono', titulo: 'Teléfono del candidato/a', tipo: 'texto', req: true },
  { key: 'origen', titulo: 'Origen del candidato/a', tipo: 'radio', opciones: ['Externo', 'Interno'], req: true },
  { key: 'familia_cargo', titulo: 'Familia del cargo', tipo: 'lista', opciones: FAMILIAS_CARGO, req: true },
  { key: 'cargo', titulo: 'Nombre del cargo', tipo: 'texto', req: true },
  { key: 'ubicacion', titulo: 'Ubicación del cargo', tipo: 'texto', req: true },
  { key: 'unidad', titulo: 'Unidad', tipo: 'lista', opciones: UNIDADES, req: true },
  { key: 'ceco', titulo: 'Centro de costos (CECO)', tipo: 'texto', req: false },
  { key: 'requiere_ref', titulo: '¿Requiere referencias?', tipo: 'radio', opciones: ['Sí', 'No'], req: true },
  { key: 'referido', titulo: '¿El candidato/a es referido?', tipo: 'radio', opciones: ['Sí', 'No'], req: true },
  { key: 'link_cv', titulo: 'Enlace al CV (Drive/OneDrive) - opcional', tipo: 'texto', req: false },
  { key: 'aspectos', titulo: 'Aspectos a indagar (funciones del cargo, énfasis en competencias, liderazgo, etc.)', tipo: 'parrafo', req: false }
];

function crearFormulario() {
  const form = FormApp.create('Solicitud de Evaluación Psicolaboral - AquaChile');
  form.setDescription(
    'Complete los datos para solicitar una evaluación psicolaboral. ' +
    'La información es confidencial y solo la ve el equipo de Reclutamiento y Selección.'
  );
  form.setCollectEmail(true);
  form.setConfirmationMessage('¡Solicitud recibida! La evaluadora se contactará con el candidato/a.');

  PREGUNTAS.forEach(function (p) {
    let item;

    if (p.tipo === 'lista') {
      item = form.addListItem().setChoiceValues(p.opciones);
    } else if (p.tipo === 'radio') {
      item = form.addMultipleChoiceItem().setChoiceValues(p.opciones);
    } else if (p.tipo === 'parrafo') {
      item = form.addParagraphTextItem();
    } else {
      item = form.addTextItem();
      if (p.tipo === 'email') {
        item.setValidation(
          FormApp.createTextValidation().requireTextIsEmail().build()
        );
      }
    }

    item.setTitle(p.titulo).setRequired(p.req);
  });

  // Respaldo de respuestas en una hoja de cálculo.
  const ss = SpreadsheetApp.create('Respaldo respuestas - Solicitudes AquaChile');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('Editar formulario: ' + form.getEditUrl());
  Logger.log('Link para compartir: ' + form.getPublishedUrl());
  Logger.log('Hoja de respaldo: ' + ss.getUrl());

  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());
}

function instalarTrigger() {
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) throw new Error('Primero ejecuta crearFormulario()');

  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('alEnviarRespuesta')
    .forForm(FormApp.openById(formId))
    .onFormSubmit()
    .create();

  Logger.log('Trigger instalado correctamente.');
}

function alEnviarRespuesta(e) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('WEBHOOK_URL');
  const token = props.getProperty('WEBHOOK_TOKEN');

  if (!url || !token) {
    console.error('Faltan WEBHOOK_URL y/o WEBHOOK_TOKEN en las propiedades del script.');
    return;
  }

  const respuesta = e.response;
  const datos = {
    enviado_en: new Date().toISOString(),
    correo_analista: respuesta.getRespondentEmail()
  };

  respuesta.getItemResponses().forEach(function (ir) {
    const p = PREGUNTAS.find(function (x) {
      return x.titulo === ir.getItem().getTitle();
    });

    if (p) datos[p.key] = ir.getResponse();
  });

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': token },
    payload: JSON.stringify(datos),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    console.error(
      'Backend respondió ' + res.getResponseCode() + ': ' + res.getContentText()
    );
  } else {
    console.log('Solicitud enviada correctamente al backend.');
  }
}
