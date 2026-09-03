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
            "que", "cual", "quienes", "como", "donde", "cuando", "tiene", "tienen", "hay",
            "del", "los", "las", "una", "uno", "unos", "unas", "el", "la", "de", "en",
            "sobre", "para", "por", "con", "informacion", "es", "son", "fue", "era"
        ]);

        const palabrasPregunta = preguntaNormalizada
            .replace(/[¿?¡!.,;:()\"]/g, "")
            .split(/\s+/)
            .filter(palabra => palabra.length > 2 && !palabrasIgnoradas.has(palabra));

        const palabrasClave = {
            autoridades: ["autoridad", "autoridades", "presidente", "vicepresidente", "secretario", "prosecretario", "tesorero", "protesorero", "vocal", "fiscalizacion"],
            biblioteca: ["biblioteca", "libros", "fondos", "documentales"],
            historia: ["historia", "historico", "legislativo", "legislatura"],
            publicaciones: ["publicacion", "publicaciones", "trabajo", "trabajos", "materiales"],
            patrimonio: ["patrimonio", "documento", "documentos", "archivo"],
            creacion: ["creacion", "creado", "fundacion", "fundado", "origen", "decreto", "reconocimiento"],
            sede: ["sede", "direccion", "domicilio", "ubicacion", "funciona", "donde funciona"],
            identidad: ["nombre", "nombre completo", "identidad", "institucion"]
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

        const respuestaSinEvidencia = () => `
${this.nombre}

No encontré información específica sobre esa consulta en la base documental disponible.

Temas documentados:
Historia legislativa, Publicaciones, Biblioteca, Patrimonio documental, Creación y reconocimiento institucional, Sede y autoridades.
        `.trim();

        // Umbral de evidencia: evita devolver un documento irrelevante por coincidencias débiles.
        if (resultados.length === 0 || resultados[0].puntuacion < 3) {
            return respuestaSinEvidencia();
        }

        const principal = resultados[0].documento;
        const contenido = principal.contenido;

        // Respuestas específicas de alta precisión.
        if (preguntaNormalizada.includes("presidente") && !preguntaNormalizada.includes("vicepresidente") && principal.titulo === "Autoridades") {
            const coincidencia = contenido.match(/Presidente:\s*([^\.]+)/i);
            if (coincidencia) return `${this.nombre}\n\nEl presidente del Círculo de Legisladores de Tucumán es ${coincidencia[1].trim()}.`;
        }

        if (preguntaNormalizada.includes("vicepresidente") && principal.titulo === "Autoridades") {
            const coincidencia = contenido.match(/Vicepresidente:\s*([^\.]+)/i);
            if (coincidencia) return `${this.nombre}\n\nEl vicepresidente del Círculo de Legisladores de Tucumán es ${coincidencia[1].trim()}.`;
        }

        if (preguntaNormalizada.includes("secretario") && !preguntaNormalizada.includes("prosecretario") && principal.titulo === "Autoridades") {
            const coincidencia = contenido.match(/Secretario:\s*([^\.]+)/i);
            if (coincidencia) return `${this.nombre}\n\nEl secretario del Círculo de Legisladores de Tucumán es ${coincidencia[1].trim()}.`;
        }

        if ((preguntaNormalizada.includes("creacion") || preguntaNormalizada.includes("creado") || preguntaNormalizada.includes("fundacion") || preguntaNormalizada.includes("decreto")) && principal.titulo === "Creación y reconocimiento institucional") {
            return `${this.nombre}\n\nSegún la documentación institucional disponible, el Círculo fue reconocido mediante el Decreto Nº 2.149, de fecha 2 de noviembre de 1982, referido a la Asociación Civil Círculo de Ex Legisladores Provinciales de Tucumán.\n\nFuente documental:\n${principal.titulo}`;
        }

        if ((preguntaNormalizada.includes("sede") || preguntaNormalizada.includes("direccion") || preguntaNormalizada.includes("domicilio") || preguntaNormalizada.includes("ubicacion") || preguntaNormalizada.includes("funciona")) && principal.titulo === "Sede institucional") {
            return `${this.nombre}\n\nLa sede institucional se encuentra en San Lorenzo 226, San Miguel de Tucumán, Tucumán.\n\nFuente documental:\n${principal.titulo}`;
        }

        if ((preguntaNormalizada.includes("nombre") || preguntaNormalizada.includes("nombre completo")) && principal.titulo === "Identidad institucional") {
            return `${this.nombre}\n\nEl nombre institucional es Círculo de Legisladores de Tucumán.\n\nFuente documental:\n${principal.titulo}`;
        }

        return `${this.nombre}\n\nSegún la documentación institucional disponible:\n\n${contenido}\n\nFuente documental:\n${principal.titulo}`;
    }
};

module.exports = circuloIA;
