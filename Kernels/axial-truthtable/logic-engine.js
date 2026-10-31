'use strict';

/**
 * KERNEL AXIAL Â· TRUTHTABLE
 * Motor de lÃ³gica proposicional clÃ¡sica.
 *
 * Sintaxis admitida:
 *   Variables: P, Q, R, P1, ESTADO_A
 *   NegaciÃ³n:  !P
 *   ConjunciÃ³n: P & Q
 *   DisyunciÃ³n: P | Q
 *   ImplicaciÃ³n material: P -> Q
 *   ParÃ©ntesis: (P | Q) & R
 *
 * Precedencia (de mayor a menor): !, &, |, ->.
 * La implicaciÃ³n es asociativa por la derecha.
 * No se ejecuta JavaScript ni se evalÃºa cÃ³digo dinÃ¡mico.
 */

const LIMITS = Object.freeze({
    maxExpressionLength: 500,
    maxPremises: 20,
    maxVariables: 12
});

class LogicSyntaxError extends Error {
    constructor(message, expression, position) {
        super(`${message} (posiciÃ³n ${position + 1}) en: "${expression}"`);
        this.name = 'LogicSyntaxError';
        this.code = 'AXIAL_LOGIC_SYNTAX_ERROR';
        this.expression = expression;
        this.position = position;
    }
}

class LogicEngine {
    tokenize(expression) {
        if (typeof expression !== 'string' || expression.trim() === '') {
            throw new TypeError('Cada expresiÃ³n lÃ³gica debe ser un texto no vacÃ­o.');
        }
        if (expression.length > LIMITS.maxExpressionLength) {
            throw new RangeError(`La expresiÃ³n supera el mÃ¡ximo de ${LIMITS.maxExpressionLength} caracteres.`);
        }

        const tokens = [];
        let position = 0;

        while (position < expression.length) {
            const current = expression[position];

            if (/\s/.test(current)) {
                position += 1;
                continue;
            }

            if (expression.startsWith('->', position)) {
                tokens.push({ type: 'IMPLIES', value: '->', position });
                position += 2;
                continue;
            }

            const symbolTypes = {
                '!': 'NOT',
                '&': 'AND',
                '|': 'OR',
                '(': 'LPAREN',
                ')': 'RPAREN'
            };

            if (symbolTypes[current]) {
                tokens.push({ type: symbolTypes[current], value: current, position });
                position += 1;
                continue;
            }

            const identifier = expression.slice(position).match(/^[A-Z][A-Za-z0-9_]*/);
            if (identifier) {
                tokens.push({ type: 'VARIABLE', value: identifier[0], position });
                position += identifier[0].length;
                continue;
            }

            throw new LogicSyntaxError(`SÃ­mbolo no permitido "${current}"`, expression, position);
        }

        return tokens;
    }

    parseExpression(expression) {
        const tokens = this.tokenize(expression);
        let cursor = 0;
        const peek = () => tokens[cursor] || null;
        const consume = (type) => {
            const token = peek();
            if (!token || token.type !== type) return null;
            cursor += 1;
            return token;
        };
        const fail = (message) => {
            const token = peek();
            const position = token ? token.position : expression.length;
            throw new LogicSyntaxError(message, expression, position);
        };

        // implication := disjunction [ '->' implication ]
        // La recursiÃ³n a la derecha hace que P -> Q -> R se interprete como P -> (Q -> R).
        const parseImplication = () => {
            const left = parseDisjunction();
            if (consume('IMPLIES')) {
                return { type: 'IMPLIES', left, right: parseImplication() };
            }
            return left;
        };

        // disjunction := conjunction ( '|' conjunction )*
        const parseDisjunction = () => {
            let node = parseConjunction();
            while (consume('OR')) {
                node = { type: 'OR', left: node, right: parseConjunction() };
            }
            return node;
        };

        // conjuncion := unary ( &  unary )*
        const parseConjunction = () => {
            let node = parseUnary();
            while (consume('AND')) {
                node = { type: 'AND', left: node, right: parseUnary() };
            }
            return node;
        };

        // unary := ! unary | ( implication ) | VARIABLE
        const parseUnary = () => {
            if (consume('NOT')) return { type: 'NOT', value: parseUnary() };

            if (consume('LPAREN')) {
                const node = parseImplication();
                if (!consume('RPAREN')) fail('Falta un parÃ¡ntesis de cierre ")"');
                return node;
            }

            const variable = consume('VARIABLE');
            if (variable) return { type: 'VARIABLE', name: variable.value };

            fail('Se esperaba una variable, una negaciÃ³n o un parÃ¡ntesis de apertura');
        };

        if (tokens.length === 0) {
            throw new LogicSyntaxError('La expresiÃ³n estÃ¡ vacÃ­a', expression, 0);
        }

        const ast = parseImplication();
        if (cursor !== tokens.length) fail(`Token inesperado "${tokens[cursor].value}"`);
        return ast;
    }

    collectVariables(ast, target = new Set()) {
        if (ast.type === 'VARIABLE') {
            target.add(ast.name);
        } else if (ast.type === 'NOT') {
            this.collectVariables(ast.value, target);
        } else {
            this.collectVariables(ast.left, target);
            this.collectVariables(ast.right, target);
        }
        return target;
    }

    extractVariables(expressions) {
        if (!Array.isArray(expressions)) {
            throw new TypeError('recorrido de formulas debe ser un arreglo.');
        }
        const variables = new Set();
        for (const expression of expressions) {
            this.collectVariables(this.parseExpression(expression), variables);
        }
        return [...variables].sort();
    }

    evaluateAst(ast, context) {
        switch (ast.type) {
            case 'VARIABLE': {
                if (!Object.prototype.hasOwnProperty.call(context, ast.name)) {
                    throw new Error(`Falta asignar un valor de verdad a la variable ${ast.name}.`);
                }
                if (typeof context[ast.name] !== 'boolean') {
                    throw new TypeError(`El valor de ${ast.name} debe ser booleano.`);
                }
                return context[ast.name];
            }
            case 'NOT':
                return !this.evaluateAst(ast.value, context);
            case 'AND':
                return this.evaluateAst(ast.left, context) && this.evaluateAst(ast.right, context);
            case 'OR':
                return this.evaluateAst(ast.left, context) || this.evaluateAst(ast.right, context);
            case 'IMPLIES':
                return !this.evaluateAst(ast.left, context) || this.evaluateAst(ast.right, context);
            default:
                throw new Error(`Nodo lÃ³gico desconocido: ${ast.type}`);
        }
    }

    evaluate(expression, context) {
        if (!context || typeof context !== 'object' || Array.isArray(context)) {
            throw new TypeError('context debe ser un objeto con asignaciones booleanas.');
        }
        const ast = this.parseExpression(expression);
        // Validar todas las variables antes de aplicar cortocircuitos AND/OR.
        // AsÃ­ una asignaciÃ³n incompleta nunca pasa inadvertida.
        for (const variable of this.collectVariables(ast)) {
            if (!Object.prototype.hasOwnProperty.call(context, variable)) {
                throw new Error(`Falta asignar un valor de verdad a la variable ${variable}.`);
            }
            if (typeof context[variable] !== 'boolean') {
                throw new TypeError(`El valor de ${variable} debe ser booleano.`);
            }
        }
        return this.evaluateAst(ast, context);
    }

    analizarArgumento({ premisas = [], conclusion = '' } = {}) {
        if (!Array.isArray(premisas) || premisas.length === 0) {
            throw new TypeError('El argumento requiere al menos una premisa.');
        }
        if (premisas.length > LIMITS.maxPremises) {
            throw new RangeError(`El argumento supera el mÃ¡ximo de ${LIMITS.maxPremises} premisas.`);
        }
        if (typeof conclusion !== 'string' || conclusion.trim() === '') {
            throw new TypeError('El argumento requiere una conclusiÃ³n no vacÃ­a.');
        }

        const formulas = premisas.map((premise, index) => {
            if (typeof premise !== 'string' || premise.trim() === '') {
                throw new TypeError(`La premisa ${index + 1} debe ser un texto no vacÃ­o.`);
            }
            return this.parseExpression(premise);
        });
        const conclusionAst = this.parseExpression(conclusion);
        const variablesSet = new Set();
        formulas.forEach(ast => this.collectVariables(ast, variablesSet));
        this.collectVariables(conclusionAst, variablesSet);
        const variables = [...variablesSet].sort();

        if (variables.length > LIMITS.maxVariables) {
            throw new RangeError(`El argumento contiene ${variables.length} variables; el mÃ¡ximo permitido es ${LIMITS.maxVariables}.`);
        }

        const totalRows = 2 ** variables.length;
        const truthTable = [];
        let isConsistent = false;
        let counterexample = null;

        for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
            const assignment = {};
            variables.forEach((variable, variableIndex) => {
                const bit = Math.floor(rowIndex / (2 ** (variables.length - variableIndex - 1))) % 2;
                assignment[variable] = bit === 1;
            });

            const premiseValues = formulas.map(ast => this.evaluateAst(ast, assignment));
            const conclusionValue = this.evaluateAst(conclusionAst, assignment);
            const premisesTrue = premiseValues.every(Boolean);

            if (premisesTrue) {
                isConsistent = true;
                if (!conclusionValue && counterexample === null) {
                    counterexample = {
                        asignacion: { ...assignment },
                        premisas: [...premiseValues],
                        conclusion: conclusionValue
                    };
                }
            }

            truthTable.push({
                asignacion: assignment,
                premisas: premiseValues,
                conclusion: conclusionValue,
                premisasVerdaderas: premisesTrue
            });
        }

        // En lÃ³gica clÃ¡sica, de un conjunto inconsistente se sigue cualquier conclusiÃ³n
        // (verdad vacua). Se informa aparte para que no parezca una validaciÃ³n sustantiva.
        const isValid = counterexample === null;
        const validityLabel = !isConsistent
            ? 'V°è[YHÜXÝZYY[Z\Ø\È[ÛÛÚ\Ý[\ÉÂ\Õ[YÈ	Õ°è[YIÈ	Ò[°è[YIÎÂ]\ÂÜX[^XÚ[ÛÂ\XX\ËÝ[[\ÎÝ[ÝÜËÙÚXØN	ÜÜÜÚXÚ[Û[Û0è\ÚXØIËXÙY[ÚXNÉÈIË	ÉË	ß	Ë	ËO×BKXU\Y]XKXYÛÜÝXÛÎÂ[Y^ÜX[\Õ[Y]\]Y]U[Y^[Y]SX[ÛÛÚ\Ý[ÚXN\ÐÛÛÚ\Ý[È	ÐÛÛÚ\Ý[IÈ	Ò[ÛÛÚ\Ý[IË\ÐÛÛÚ\Ý[N\ÐÛÛÚ\Ý[ÛÛYZ[\ÎÛÝ[\^[\BKÛÛY^X]\X[Â\ÝYÎ	ÓÈ][XYIËY\[ÚXN	ÓH[Y^ÜX[È[]Y\ÝHH\YXÝX[H\È[Z\Ø\ËÝH\YXØXÚpìÛ\]ZY\H]Y[ÚXH[\[Y[KÂBNÂBBÛÛÝÙÚXÑ[Ú[HH]ÈÙÚXÑ[Ú[J
NÂÙÚXÑ[Ú[KÙÚXÑ[Ú[HHÙÚXÑ[Ú[NÂÙÚXÑ[Ú[KÙÚXÔÞ[^\ÜHÙÚXÔÞ[^\ÜÂÙÚXÑ[Ú[KSRUÈHSRUÎÂ[Ù[K^ÜÈHÙÚXÑ[Ú[NÂ