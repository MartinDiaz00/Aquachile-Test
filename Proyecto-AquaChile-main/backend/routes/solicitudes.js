const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT * FROM solicitudes ORDER BY id");
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para recibir solicitudes desde Google Forms
router.post("/desde-form", async (req, res) => {
  const token = req.headers["x-api-key"];

  if (!token || token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const {
    analista,
    nombre,
    correo,
    telefono,
    origen,
    familia_cargo,
    cargo,
    ubicacion,
    unidad,
    ceco,
    requiere_ref,
    referido,
    link_cv,
    aspectos,
    correo_analista
  } = req.body;

  if (!nombre || !correo || !cargo || !familia_cargo || !analista) {
    return res.status(400).json({
      error: "Faltan datos obligatorios del formulario"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Crear candidato
    const candidato = await client.query(
      `INSERT INTO candidatos
        (nombre, correo, telefono, cargo_postulado, familia_cargo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        nombre,
        correo,
        telefono || "",
        cargo,
        familia_cargo
      ]
    );

    const candidatoCreado = candidato.rows[0];

    // Convertir respuestas del formulario a booleanos
    const requiereReferencias =
      String(requiere_ref).toLowerCase() === "sí" ||
      String(requiere_ref).toLowerCase() === "si";

    const esReferido =
      String(referido).toLowerCase() === "sí" ||
      String(referido).toLowerCase() === "si";

    const tieneCv = !!link_cv;

    // Información que no tiene una columna propia en la BD actual
    const observaciones = [
      ubicacion ? `Ubicación: ${ubicacion}` : "",
      link_cv ? `CV: ${link_cv}` : "",
      correo_analista ? `Correo analista: ${correo_analista}` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    // 2. Crear solicitud relacionada al candidato
    const solicitud = await client.query(
      `INSERT INTO solicitudes
        (
          candidato_id,
          cargo,
          familia_cargo,
          fecha_solicitud,
          estado,
          responsable,
          observaciones,
          origen_candidato,
          unidad,
          requiere_referencias,
          ceco,
          cv_adjunto,
          descriptor_adjunto,
          aspectos_indagar,
          es_referido
        )
       VALUES
        (
          $1,
          $2,
          $3,
          CURRENT_DATE,
          'Pendiente',
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          false,
          $11,
          $12
        )
       RETURNING *`,
      [
        candidatoCreado.id,
        cargo,
        familia_cargo,
        analista,
        observaciones,
        origen,
        unidad,
        requiereReferencias,
        ceco || "",
        tieneCv,
        aspectos || "",
        esReferido
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      mensaje: "Solicitud recibida correctamente",
      candidato: candidatoCreado,
      solicitud: solicitud.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error al procesar solicitud desde formulario:", error);

    res.status(500).json({
      error: "No se pudo guardar la solicitud",
      detalle: error.message
    });

  } finally {
    client.release();
  }
});

router.post("/", async (req, res) => {
  const {
    candidato_id,
    cargo,
    familia_cargo,
    fecha_solicitud,
    responsable,
    origen_candidato,
    unidad,
    requiere_referencias,
    ceco,
    cv_adjunto,
    descriptor_adjunto,
    aspectos_indagar,
    es_referido,
  } = req.body;

  try {
    const resultado = await pool.query(
      `INSERT INTO solicitudes
         (
           candidato_id,
           cargo,
           familia_cargo,
           fecha_solicitud,
           estado,
           responsable,
           observaciones,
           origen_candidato,
           unidad,
           requiere_referencias,
           ceco,
           cv_adjunto,
           descriptor_adjunto,
           aspectos_indagar,
           es_referido
         )
       VALUES
         ($1, $2, $3, $4, 'Pendiente', $5, '', $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        candidato_id,
        cargo,
        familia_cargo,
        fecha_solicitud,
        responsable,
        origen_candidato,
        unidad,
        requiere_referencias,
        ceco,
        cv_adjunto,
        descriptor_adjunto,
        aspectos_indagar,
        es_referido
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    const resultado = await pool.query(
      "UPDATE solicitudes SET estado = $1 WHERE id = $2 RETURNING *",
      [estado, id]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;