const documentos = require("../documentos.json");

const circuloIA = {
    nombre: "CÍRCULO IA",
    identidad: {
        rol: "Asistente institucional del Círculo de Legisladores",
        mision: "Facilitar acceso al conocimiento histórico, documental e institucional."
    },

    responder: function (pregunta) {
        const normalizar = texto => (texto || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const q = normalizar(pregunta);
        const docs = documentos.documentos;
        const buscar = titulo => docs.find(d => d.titulo === titulo);
        const salida = (doc, extra = doc && doc.contenido) => doc
            ? `${this.nombre}\n\n${extra}\n\nFuente documental:\n${doc.titulo}`
            : `${this.nombre}\n\nNo encontré información específica sobre esa consulta en la base documental disponible.`;

        // Respuestas deterministas para las consultas visibles en la interfaz.
        if (q.includes("quienes somos")) {
            const doc = buscar("Quiénes somos");
            return salida(doc);
        }

        if (q.includes("quienes son las autoridades") || q === "autoridades" || q.includes("autoridades")) {
            const doc = buscar("Autoridades");
            return salida(doc, `Según la documentación institucional disponible:\n\n${doc.contenido}`);
        }

        if (q.includes("donde esta ubicado") || q.includes("donde esta ubicada") || q.includes("ubicacion") || q.includes("direccion") || q.includes("donde queda") || q.includes("sede")) {
            const doc = buscar("Ubicación y contacto institucional");
            return salida(doc);
        }

        if (q.includes("cual es la mision") || q.includes("mision")) {
            const doc = buscar("Misión institucional");
            return salida(doc);
        }

        if (q.includes("que actividades realiza") || q.includes("actividades")) {
            const doc = buscar("Actividades institucionales");
            return salida(doc);
        }

        if (q.includes("ley 6333") || q.includes("ley provincial 6333")) {
            const doc = buscar("Ley Provincial Nº 6.333");
            return salida(doc);
        }

        if (q.includes("cual es la historia") || q === "historia" || q.includes("historia del circulo") || q.includes("historia institucional")) {
            const doc = buscar("Historia legislativa");
            return salida(doc);
        }

        if (q.includes("como funciona circulo ia") || q.includes("como funciona el circulo ia") || q.includes("como funciona")) {
            return `${this.nombre}\n\nCÍRCULO IA es el asistente institucional del Círculo de Legisladores de Tucumán. Su función es orientar sobre historia, legislación, autoridades, actividades y patrimonio documental a partir de la documentación institucional disponible.`;
        }

        const consultaOrigen = q.includes("creo el circulo") || q.includes("fue creado") || q.includes("cuando fue creado") || q.includes("como fue creado") || q.includes("como se fundo") || q.includes("fundacion") || q.includes("fecha de creacion") || q.includes("origen institucional") || q.includes("que decreto reconoce") || q.includes("decreto que reconoce") || q.includes("cuando se creo");
        if (consultaOrigen) {
            const origen = buscar("Creación y reconocimiento institucional");
            return salida(origen, `Según la documentación institucional disponible, el origen institucional está documentado mediante el Decreto Nº 2.149, de fecha 2 de noviembre de 1982, referido a la Asociación Civil Círculo de Ex Legisladores Provinciales de Tucumán.`);
        }

        const palabrasIgnoradas = new Set(["que", "cual", "quienes", "como", "donde", "cuando", "tiene", "tienen", "hay", "del", "los", "las", "una", "uno", "unos", "unas", "el", "la", "de", "en", "sobre", "para", "por", "con", "informacion", "es", "son"]);
        const palabras = q.split(/\s+/).filter(p => p.length > 2 && !palabrasIgnoradas.has(p));
        const resultados = docs.map(doc => {
            const texto = normalizar(`${doc.titulo} ${doc.categoria} ${doc.contenido}`);
            let puntuacion = 0;
            palabras.forEach(p => { if (normalizar(doc.titulo).includes(p)) puntuacion += 10; else if (texto.includes(p)) puntuacion += 1; });
            return { doc, puntuacion };
        }).filter(r => r.puntuacion > 0).sort((a, b) => b.puntuacion - a.puntuacion);

        if (!resultados.length) {
            return `${this.nombre}\n\nNo encontré información específica sobre esa consulta en la base documental disponible.\n\nTemas disponibles:\nHistoria, Ley 6333, Misión, Actividades, Ubicación y Autoridades.`;
        }

        return salida(resultados[0].doc, `Según la documentación institucional disponible:\n\n${resultados[0].doc.contenido}`);
    }
};

module.exports = circuloIA;
