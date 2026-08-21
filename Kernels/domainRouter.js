/**
 * AXIAL KERNEL
 * Domain Router
 *
 * Decide qué hacer después del análisis semántico.
 */

function route(analysis) {

    const { domain, confidence } = analysis;

    // La pregunta pertenece claramente
    // al dominio institucional.
    if (domain === "institucional" && confidence >= 0.60) {

        return {
            estado: "aceptada",
            dominio: "institucional",
            accion: "consultar_rag"
        };
    }

    // La pregunta tiene relación posible,
    // pero el Kernel todavía no comprende
    // suficientemente la intención.
    if (domain === "ambiguo") {

        return {
            estado: "requiere_reformulacion",
            dominio: "ambiguo",
            accion: "sugerir_conceptos"
        };
    }

    // No se pudo establecer relación
    // con el dominio institucional.
    return {
        estado: "fuera_de_dominio",
        dominio: "externo",
        accion: "flujo_externo"
    };
}

module.exports = {
    route
};