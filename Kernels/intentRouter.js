/**
 * AXIAL KERNEL - Intent Router
 *
 * Determina qué tipo de pedido hace el usuario.
 * El canal de entrada NO decide el agente: el Kernel lo decide aquí.
 */

function classify(question = "") {
    const text = question
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (/\b(telefono|telefonos|numero|numeros|llamar|contactar|whatsapp)\b/.test(text)) {
        return { tipo: "orientacion", agente: "orientacion", confianza: 0.95 };
    }

    if (/\b(dejar|enviar|mandar|hacer)\b.*\b(mensaje|consulta|pedido)\b/.test(text) ||
        /\b(quiero hablar|quiero comunicarme|quiero contactar)\b/.test(text)) {
        return { tipo: "contacto", agente: "contacto", confianza: 0.92 };
    }

    if (/\b(aprender|ensenar|formacion|formativo|historia parlamentaria|ciudadania|participar|participacion|compromiso civico)\b/.test(text)) {
        return { tipo: "formativa", agente: "formativo", confianza: 0.90 };
    }

    if (/\b(horario|horarios|direccion|donde|como asociarme|asociarme|tramite|actividad|actividades|funciona|funcionan|reunion|reuniones)\b/.test(text)) {
        return { tipo: "operativa", agente: "operativo", confianza: 0.88 };
    }

    return { tipo: "institucional", agente: "institucional", confianza: 0.70 };
}

module.exports = { classify };
