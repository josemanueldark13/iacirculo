const documentos = require("../knowledge/documentos.json");

const circuloIA = {

    nombre: "CÍRCULO IA",

    identidad: {
        rol: "Asistente institucional del Círculo de Legisladores",
        mision: "Facilitar acceso al conocimiento histórico, documental e institucional."
    },


    responder: function(pregunta) {

        return `
        Soy ${this.nombre}.

        Institución:
        ${documentos.institucion.nombre}

        Tipo:
        ${documentos.institucion.tipo}

        Consulta:
        ${pregunta}

        Temas disponibles:
        ${documentos.institucion.temas.join(", ")}
        `;
    }

};


module.exports = circuloIA;

module.exports = circuloIA;