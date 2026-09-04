const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");

const preguntas = [
    "¿Cuándo se creó el Círculo de Ex Legisladores Provinciales de Tucumán?",
    "¿Qué decreto dio origen al Círculo de Ex Legisladores Provinciales de Tucumán?",
    "¿De qué fecha es el Decreto Nº 2.149 relacionado con la creación del Círculo?",
    "¿Cuál fue el motivo o finalidad de la creación del Círculo?",
    "¿Cuál es el nombre completo de la institución?",
    "¿Dónde funciona actualmente el Círculo de Legisladores?",
    "¿Cuál es la dirección institucional del Círculo?",
    "¿Quién es actualmente el presidente del Círculo de Legisladores?",
    "¿Quién ocupa la vicepresidencia?",
    "¿Cómo está conformada la estructura de autoridades del Círculo?",
    "¿Cuál es la historia del Círculo de Legisladores de Tucumán?",
    "¿Qué importancia tiene el Círculo para la historia legislativa de Tucumán?",
    "¿Qué documentación histórica conserva el Círculo?",
    "¿Qué importancia tiene su patrimonio documental?",
    "¿Qué función cumple la biblioteca del Círculo?",
    "¿Qué tipo de materiales pueden encontrarse en la biblioteca?",
    "¿Qué publicaciones ha realizado el Círculo?",
    "¿Qué relación existe entre la biblioteca y la preservación de la memoria legislativa?",
    "¿Por qué puede considerarse al Círculo un espacio de conservación de memoria institucional?",
    "¿Qué actividades desarrolla el Círculo relacionadas con la cultura y la historia?",
    "¿Qué relación existe entre la creación del Círculo en 1982 y su función actual?",
    "¿Cómo contribuye el Círculo a conservar la memoria de quienes integraron la Legislatura?",
    "¿Qué relación hay entre las autoridades actuales y la continuidad institucional del Círculo?",
    "¿Cómo se relacionan la biblioteca, las publicaciones y el patrimonio documental?",
    "¿Por qué la documentación histórica del Círculo puede ser relevante para investigadores?",
    "¿Qué relación tiene el Círculo de Legisladores de Tucumán con otras instituciones similares de Argentina?",
    "¿Qué función cumplen los círculos de legisladores o ex legisladores en otros lugares del país?",
    "¿Qué información histórica externa podría utilizarse para contextualizar la creación del Círculo de Tucumán?",
    "¿Dónde podría consultar un investigador fuentes adicionales sobre la historia legislativa de Tucumán?",
    "¿Qué información sobre el Círculo debería verificarse en fuentes oficiales antes de considerarla definitiva?"
];

console.log("=== CÍRCULO IA / TEST 30 ===");

preguntas.forEach((pregunta, i) => {
    const decision = kernel.process(pregunta);
    const respuesta = decision.estado === "aceptada" && !decision.requiere_fuente_externa
        ? circuloIA.responder(pregunta)
        : "[flujo no local]";

    console.log(JSON.stringify({
        n: i + 1,
        pregunta,
        estado: decision.estado,
        confianza: decision.confianza,
        modulos_rag: decision.modulos_rag || [],
        modulo_prioritario: decision.modulo_prioritario || null,
        tipo_respuesta: decision.tipo_respuesta || null,
        requiere_fuente_externa: decision.requiere_fuente_externa || false,
        respuesta
    }, null, 2));
});
