const documentos = require("../knowledge/documentos.json");

function normalizar(texto) {
    return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function recuperar(pregunta, limite = 3) {

    const preguntaNormalizada = normalizar(pregunta);

    const palabrasIgnoradas = new Set([
        "que", "cual", "quienes", "como", "donde",
        "cuando", "tiene", "tienen", "hay",
        "del", "los", "las", "una", "uno",
        "unos", "unas", "el", "la", "de",
        "en", "sobre", "para", "por", "con",
        "informacion"
    ]);

    const palabras = preguntaNormalizada
        .replace(/[¿?¡!.,;:()"]/g, "")
        .split(/\s+/)
        .filter(palabra =>
            palabra.length > 2 &&
            !palabrasIgnoradas.has(palabra)
        );

    return documentos.documentos
        .map(doc => {

            const titulo = normalizar(doc.titulo);
            const categoria = normalizar(doc.categoria);
            const contenido = normalizar(doc.contenido);

            let puntuacion = 0;

            palabras.forEach(palabra => {

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
                puntuacion
            };

        })
        .filter(resultado => resultado.puntuacion > 0)
        .sort((a, b) => b.puntuacion - a.puntuacion)
        .slice(0, limite);
}

module.exports = {
    recuperar
};