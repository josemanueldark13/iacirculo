const documentos = require("../knowledge/documentos.json");

const circuloIA = {

    nombre: "CÍRCULO IA",

    identidad: {
        rol: "Asistente institucional del Círculo de Legisladores",
        mision: "Facilitar acceso al conocimiento histórico, documental e institucional."
    },

    responder: function(pregunta) {

        const preguntaNormalizada = pregunta
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

        const palabrasIgnoradas = new Set([
            "que", "cual", "quienes", "como", "donde",
            "cuando", "tiene", "tienen", "hay",
            "del", "los", "las", "una", "uno",
            "unos", "unas", "el", "la", "de",
            "en", "sobre", "para", "por", "con",
            "informacion"
        ]);

        const palabrasPregunta = preguntaNormalizada
            .replace(/[¿?¡!.,;:()"]/g, "")
            .split(/\s+/)
            .filter(palabra =>
                palabra.length > 2 &&
                !palabrasIgnoradas.has(palabra)
            );

        const resultados = documentos.documentos
            .map(doc => {

                const titulo = (doc.titulo || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");

                const categoria = (doc.categoria || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");

                const contenido = (doc.contenido || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");

                let puntuacion = 0;

                palabrasPregunta.forEach(palabra => {

                    if (titulo.includes(palabra)) {
                        puntuacion += 5;
                    }

                    if (categoria.includes(palabra)) {
                        puntuacion += 4;
                    }

                    if (contenido.includes(palabra)) {
                        puntuacion += 1;
                    }

                });

                return {
                    documento: doc,
                    puntuacion: puntuacion
                };

            })
            .filter(resultado =>
                resultado.puntuacion > 0
            )
            .sort((a, b) =>
                b.puntuacion - a.puntuacion
            )
            .slice(0, 3);

        if (resultados.length === 0) {

            return `
${this.nombre}

No encontré información específica sobre esa consulta
en la base documental disponible.

Temas disponibles:
Historia legislativa, Publicaciones, Biblioteca, Patrimonio documental.
            `;

        }

        return `
${this.nombre}

Consulta:
"${pregunta}"

Información encontrada:

${resultados.map(resultado => {

    const doc = resultado.documento;

    return `
Título: ${doc.titulo}
Categoría: ${doc.categoria}
Contenido: ${doc.contenido}
`;

}).join("\n")}
        `;

    }

};

module.exports = circuloIA;
