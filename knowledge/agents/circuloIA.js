const documentos = require("../documentos.json");

const circuloIA = {

    nombre: "CÍRCULO IA",

    identidad: {
        rol: "Asistente institucional del Círculo de Legisladores",
        mision: "Facilitar acceso al conocimiento histórico, documental e institucional."
    },

    responder: function(pregunta) {

        const normalizar = texto =>
            (texto || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

        const preguntaNormalizada = normalizar(pregunta);

        const palabrasIgnoradas = new Set([
            "que", "cual", "quienes", "como", "donde",
            "cuando", "tiene", "tienen", "hay",
            "del", "los", "las", "una", "uno",
            "unos", "unas", "el", "la", "de",
            "en", "sobre", "para", "por", "con",
            "informacion", "es", "son"
        ]);

        const palabrasPregunta = preguntaNormalizada
            .replace(/[¿?¡!.,;:()\"]/g, "")
            .split(/\s+/)
            .filter(palabra =>
                palabra.length > 2 &&
                !palabrasIgnoradas.has(palabra)
            );

        const palabrasClave = {

            autoridades: [
                "autoridad", "autoridades", "presidente", "vicepresidente",
                "secretario", "prosecretario", "tesorero", "protesorero",
                "vocal", "fiscalizacion"
            ],

            biblioteca: ["biblioteca", "libros", "fondos", "documentales"],
            historia: ["historia", "historico", "legislativo", "legislatura"],
            publicaciones: ["publicacion", "publicaciones", "trabajo", "trabajos", "materiales"],
            patrimonio: ["patrimonio", "documento", "documentos", "archivo"]

        };

        const resultados = documentos.documentos
            .map(doc => {

                const titulo = normalizar(doc.titulo);
                const categoria = normalizar(doc.categoria);
                const contenido = normalizar(doc.contenido);

                let puntuacion = 0;

                palabrasPregunta.forEach(palabra => {

                    if (titulo.includes(palabra)) puntuacion += 10;
                    if (categoria.includes(palabra)) puntuacion += 5;
                    if (contenido.includes(palabra)) puntuacion += 1;

                });

                for (const grupo in palabrasClave) {

                    const coincidePregunta = palabrasClave[grupo].some(palabra =>
                        preguntaNormalizada.includes(palabra)
                    );

                    if (coincidePregunta) {

                        const coincideDocumento =
                            titulo.includes(grupo) ||
                            categoria.includes(grupo) ||
                            contenido.includes(grupo);

                        if (coincideDocumento) puntuacion += 20;
                    }
                }

                return { documento: doc, puntuacion };

            })
            .filter(resultado => resultado.puntuacion > 0)
            .sort((a, b) => b.puntuacion - a.puntuacion);

        if (resultados.length === 0) {
            return `
${this.nombre}

No encontré información específica sobre esa consulta
en la base documental disponible.

Temas disponibles:
Historia legislativa, Publicaciones, Biblioteca, Patrimonio documental.
            `;
        }

        const principal = resultados[0].documento;

        // -----------------------------------------
        // ORIGEN / CREACIÓN INSTITUCIONAL
        // -----------------------------------------

        const consultaOrigen =
            preguntaNormalizada.includes("creo el circulo") ||
            preguntaNormalizada.includes("creo el circulo de legisladores") ||
            preguntaNormalizada.includes("fue creado") ||
            preguntaNormalizada.includes("cuando fue creado") ||
            preguntaNormalizada.includes("como fue creado") ||
            preguntaNormalizada.includes("como se fundo") ||
            preguntaNormalizada.includes("fundacion") ||
            preguntaNormalizada.includes("fecha de creacion") ||
            preguntaNormalizada.includes("origen institucional") ||
            preguntaNormalizada.includes("que decreto reconoce") ||
            preguntaNormalizada.includes("decreto que reconoce") ||
            preguntaNormalizada.includes("cuando se creo");

        if (consultaOrigen) {
            const origen = documentos.documentos.find(doc =>
                doc.titulo === "Creación y reconocimiento institucional"
            );

            if (origen) {
                return `
${this.nombre}

Según la documentación institucional disponible, el origen institucional está documentado mediante el Decreto Nº 2.149, de fecha 2 de noviembre de 1982, referido a la Asociación Civil Círculo de Ex Legisladores Provinciales de Tucumán.

Fuente documental:
${origen.titulo}
                `.trim();
            }
        }

        // -----------------------------------------
        // RESPUESTAS ESPECÍFICAS DE AUTORIDADES
        // -----------------------------------------

        if (
            preguntaNormalizada.includes("presidente") &&
            !preguntaNormalizada.includes("vicepresidente") &&
            principal.titulo === "Autoridades"
        ) {
            const coincidencia = principal.contenido.match(/Presidente:\s*([^\.]+)/i);
            if (coincidencia) {
                return `${this.nombre}\n\nEl presidente del Círculo de Legisladores de Tucumán es ${coincidencia[1].trim()}.`;
            }
        }

        if (
            preguntaNormalizada.includes("vicepresidente") &&
            principal.titulo === "Autoridades"
        ) {
            const coincidencia = principal.contenido.match(/Vicepresidente:\s*([^\.]+)/i);
            if (coincidencia) {
                return `${this.nombre}\n\nEl vicepresidente del Círculo de Legisladores de Tucumán es ${coincidencia[1].trim()}.`;
            }
        }

        if (
            preguntaNormalizada.includes("secretario") &&
            !preguntaNormalizada.includes("prosecretario") &&
            principal.titulo === "Autoridades"
        ) {
            const coincidencia = principal.contenido.match(/Secretario:\s*([^\.]+)/i);
            if (coincidencia) {
                return `${this.nombre}\n\nEl secretario del Círculo de Legisladores de Tucumán es ${coincidencia[1].trim()}.`;
            }
        }

        // -----------------------------------------
        // RESPUESTA GENERAL
        // -----------------------------------------

        return `
${this.nombre}

Según la documentación institucional disponible:

${principal.contenido}

Fuente documental:
${principal.titulo}
        `.trim();

    }

};

module.exports = circuloIA;
