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
        const docs = Array.isArray(documentos.documentos) ? documentos.documentos : [];
        const buscar = (...titulos) => docs.find(d => titulos.includes(d.titulo));
        const salida = (doc, extra) => {
            if (!doc) {
                return `${this.nombre}\n\nNo encontré información específica sobre esa consulta en la base documental disponible.`;
            }
            return `${this.nombre}\n\n${extra || doc.contenido}\n\nFuente documental:\n${doc.titulo}`;
        };

        // Consultas institucionales principales: respuestas deterministas.
        if (/(^|\s)(quienes somos|quien es el circulo)(\s|$)/.test(q)) {
            return salida(buscar("Quiénes somos"));
        }

        if (q.includes("autoridades") || q.includes("presidente") || q.includes("vicepresidente") || q.includes("secretario") || q.includes("tesorero")) {
            const doc = buscar("Autoridades");
            return salida(doc, `Según la documentación institucional disponible:\n\n${doc ? doc.contenido : ""}`);
        }

        if (q.includes("donde esta ubicado") || q.includes("donde esta ubicada") || q.includes("ubicacion") || q.includes("direccion") || q.includes("donde queda") || q.includes("sede") || q.includes("contacto") || q.includes("mail") || q.includes("correo")) {
            return salida(buscar("Ubicación y contacto institucional"));
        }

        if (q.includes("cual es la mision") || q === "mision" || q.includes("mision institucional")) {
            return salida(buscar("Misión institucional"));
        }

        if (q.includes("que actividades realiza") || q === "actividades" || q.includes("actividades institucionales")) {
            return salida(buscar("Actividades institucionales"));
        }

        // La Ley 6333 debe reconocerse siempre, incluso con variantes de escritura.
        if (/ley\s*(provincial\s*)?6333/.test(q) || q.includes("ley 6 333")) {
            const doc = buscar(
                "Ley Provincial Nº 6.333 — Creación del Círculo de Legisladores de la Provincia de Tucumán",
                "Ley Provincial Nº 6.333"
            );
            return salida(doc, `La Ley Provincial Nº 6.333 corresponde a la creación del Círculo de Legisladores de la Provincia de Tucumán. Es la norma de referencia para la constitución del Círculo.\n\nCuando se solicite el texto literal o el articulado completo, debe consultarse la fuente oficial de la Honorable Legislatura de Tucumán para evitar atribuir contenido no verificado.`);
        }

        if (q.includes("cual es la historia") || q === "historia" || q.includes("historia del circulo") || q.includes("historia institucional")) {
            return salida(buscar("Historia legislativa"));
        }

        if (q.includes("como funciona circulo ia") || q.includes("como funciona el circulo ia") || q === "desarrollo" || q.includes("como funciona")) {
            return `${this.nombre}\n\nCÍRCULO IA es el asistente institucional del Círculo de Legisladores de Tucumán. Su función es orientar sobre historia, legislación, autoridades, actividades y patrimonio documental a partir de la documentación institucional disponible.`;
        }

        if (q.includes("cuando se creo") || q.includes("cuando fue creado") || q.includes("fecha de creacion") || q.includes("como se fundo") || q.includes("fundacion") || q.includes("origen institucional") || q.includes("que decreto reconoce")) {
            const origen = buscar("Creación y reconocimiento institucional");
            return salida(origen, "Según la documentación institucional disponible, el origen institucional está documentado mediante el Decreto Nº 2.149, de fecha 2 de noviembre de 1982, referido a la Asociación Civil Círculo de Ex Legisladores Provinciales de Tucumán.");
        }

        // Búsqueda simple por coincidencia de palabras, como fallback.
        const ignoradas = new Set(["que", "cual", "quienes", "como", "donde", "cuando", "tiene", "tienen", "hay", "del", "los", "las", "una", "uno", "unos", "unas", "el", "la", "de", "en", "sobre", "para", "por", "con", "informacion", "es", "son"]);
        const palabras = q.split(/\s+/).filter(p => p.length > 2 && !ignoradas.has(p));
        const resultados = docs.map(doc => {
            const texto = normalizar(`${doc.titulo} ${doc.categoria} ${doc.contenido}`);
            let puntuacion = 0;
            for (const p of palabras) {
                if (normalizar(doc.titulo).includes(p)) puntuacion += 10;
                else if (texto.includes(p)) puntuacion += 1;
            }
            return { doc, puntuacion };
        }).filter(r => r.puntuacion > 0).sort((a, b) => b.puntuacion - a.puntuacion);

        if (!resultados.length) {
            return `${this.nombre}\n\nNo encontré información específica sobre esa consulta en la base documental disponible.\n\nTemas disponibles:\nHistoria, Ley 6333, Misión, Actividades, Ubicación, Contacto y Autoridades.`;
        }

        return salida(resultados[0].doc, `Según la documentación institucional disponible:\n\n${resultados[0].doc.contenido}`);
    }
};

module.exports = circuloIA;
