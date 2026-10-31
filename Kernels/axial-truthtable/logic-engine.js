'use strict';

/**
 * KERNEL AXIAL · TRUTHTABLE
 * Motor de lógica proposicional clásica.
 * Sintaxis: variables P/Q/R, negación !, conjunción &, disyunción |,
 * implicación -> y paréntesis. Precedencia: ! > & > | > ->.
 * La implicación es asociativa a la derecha. No ejecuta JavaScript dinámico.
 */

const LIMITS = Object.freeze({
    maxExpressionLength: 500,
    maxPremises: 20,
    maxVariables: 12
});

class LogicSyntaxError extends SyntaxError {
    constructor(message, expression, position) {
        super(message + ' (posición ' + (position + 1) + ') en: "' + expression + '"');
        this.name = 'LogicSyntaxError';
        this.code = 'AXIAL_LOGIC_SYNTAX_ERROR';
        this.expression = expression;
        this.position = position;
    }
}

class LogicEngine {
    tokenize(expression) {
        if (typeof expression !== 'string' || expression.trim() === '') {
            throw new TypeError('Cada expresión lógica debe ser un texto no vacío.');
        }
        if (expression.length > LIMITS.maxExpressionLength) {
            throw new RangeError('La expresión supera el máximo de ' + LIMITS.maxExpressionLength + ' caracteres.');
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

            const symbols = {
                '!': 'NOT',
                '&': 'AND',
                '|': 'OR',
                '(': 'LPAREN',
                ')': 'RPAREN'
            };

            if (symbols[current]) {
                tokens.push({ type: symbols[current], value: current, position });
                position += 1;
                continue;
            }

            const identifier = expression.slice(position).match(/^[A-Za-z][A-Za-z0-9_]*/);
            if (identifier) {
                tokens.push({ type: 'VARIABLE', value: identifier[0], position });
                position += identifier[0].length;
                continue;
            }

            throw new LogicSyntaxError('Símbolo no permitido "' + current + '"', expression, position);
        }

        return tokens;
    }

    parseExpression(expression) {
        const tokens = this.tokenize(expression);
        let cursor = 0;

        const peek = () => tokens[cursor] || null;
        const consume = (type) => {
            if (!peek() || peek().type !== type) return null;
            const token = tokens[cursor];
            cursor += 1;
            return token;
        };
        const fail = (message) => {
            const token = peek();
            const position = token ? token.position : expression.length;
            throw new LogicSyntaxError(message, expression, position);
        };

        const parseUnary = () => {
            if (consume('NOT')) {
                return { type: 'NOT', value: parseUnary() };
            }

            if (consume('LPAREN')) {
                const node = parseImplication();
                if (!consume('RPAREN')) fail('Falta el paréntesis de cierre ")"');
                return node;
            }

            const variable = consume('VARIABLE');
            if (variable) return { type: 'VARIABLE', name: variable.value };

            fail('Se esperaba una variable, una negación o un paréntesis de apertura');
        };

        const parseConjunction = () => {
            let node = parseUnary();
            while (consume('AND')) {
                node = { type: 'AND', left: node, right: parseUnary() };
            }
            return node;
        };

        const parseDisjunction = () => {
            let node = parseConjunction();
            while (consume('OR')) {
                node = { type: 'OR', left: node, right: parseConjunction() };
            }
            return node;
        };

        const parseImplication = () => {
            const left = parseDisjunction();
            if (consume('IMPLIES')) {
                return { type: 'IMPLIES', left, right: parseImplication() };
            }
            return left;
        };

        if (tokens.length === 0) {
            throw new LogicSyntaxError('La expresión está vacía', expression, 0);
        }

        const ast = parseImplication();
        if (cursor !== tokens.length) {
            fail('Token inesperado "' + peek().value + '"');
        }
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
            throw new TypeError('El conjunto de fórmulas debe ser un arreglo.');
        }
        const variables = new Set();
        expressions.forEach((expression) => {
            this.collectVariables(this.parseExpression(expression), variables);
        });
        return [...variables].sort();
    }

    evaluateAst(ast, context) {
        switch (ast.type) {
            case 'VARIABLE':
                return context[ast.name];
            case 'NOT':
                return !this.evaluateAst(ast.value, context);
            case 'AND':
                return this.evaluateAst(ast.left, context) && this.evaluateAst(ast.right, context);
            case 'OR':
                return this.evaluateAst(ast.left, context) || this.evaluateAst(ast.right, context);
            case 'IMPLIES':
                return !this.evaluateAst(ast.left, context) || this.evaluateAst(ast.right, context);
            default:
                throw new Error('Nodo lógico desconocido: ' + ast.type);
        }
    }

    evaluate(expression, context) {
        if (!context || typeof context !== 'object' || Array.isArray(context)) {
            throw new TypeError('El contexto debe ser un objeto con asignaciones booleanas.');
        }

        const ast = this.parseExpression(expression);
        const variables = this.collectVariables(ast);

        for (const variable of variables) {
            if (!Object.prototype.hasOwnProperty.call(context, variable)) {
                throw new Error('Falta asignar un valor de verdad a la variable ' + variable + '.');
            }
            if (typeof context[variable] !== 'boolean') {
                throw new TypeError('El valor de ' + variable + ' debe ser booleano.');
            }
        }

        return this.evaluateAst(ast, context);
    }

    analizarArgumento({ premisas = [], conclusion = '' } = {}) {
        if (!Array.isArray(premisas) || premisas.length === 0) {
            throw new TypeError('El argumento requiere al menos una premisa.');
        }
        if (premisas.length > LIMITS.maxPremises) {
            throw new RangeError('El argumento supera el máximo de ' + LIMITS.maxPremises + ' premisas.');
        }
        if (typeof conclusion !== 'string' || conclusion.trim() === '') {
            throw new TypeError('El argumento requiere una conclusión no vacía.');
        }

        const formulaAsts = premisas.map((premise, index) => {
            if (typeof premise !== 'string' || premise.trim() === '') {
                throw new TypeError('La premisa ' + (index + 1) + ' debe ser un texto no vacío.');
            }
            return this.parseExpression(premise);
        });
        const conclusionAst = this.parseExpression(conclusion);
        const variableSet = new Set();

        formulaAsts.forEach(ast => this.collectVariables(ast, variableSet));
        this.collectVariables(conclusionAst, variableSet);
        const variables = [...variableSet].sort();

        if (variables.length > LIMITS.maxVariables) {
            throw new RangeError(
                'El argumento contiene ' + variables.length + ' variables; el máximo permitido es ' + LIMITS.maxVariables + '.'
            );
        }

        const totalRows = 2 ** variables.length;
        const truthTable = [];
        let isConsistent = false;
        let counterexample = null;

        for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
            const assignment = {};
            variables.forEach((variable, variableIndex) => {
                const bit = Math.floor(
                    rowIndex / (2 ** (variables.length - variableIndex - 1))
                ) % 2;
                assignment[variable] = bit === 1;
            });

            const premiseValues = formulaAsts.map(ast => this.evaluateAst(ast, assignment));
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
                asignacion: { ...assignment },
                premisas: premiseValues,
                conclusion: conclusionValue,
                premisasVerdaderas: premisesTrue
            });
        }

        const isValid = counterexample === null;
        const validityLabel = !isConsistent
            ? 'Válida por vacuidad: premisas inconsistentes'
            : isValid ? 'Válida' : 'Inválida';

        return {
            formalizacion: {
                variables,
                totalFilas: totalRows,
                logica: 'proposicional clásica',
                precedencia: ['!', '&', '|', '->']
            },
            tablaVerdad: truthTable,
            diagnostico: {
                validezFormal: isValid,
                etiquetaValidez: validityLabel,
                consistencia: isConsistent ? 'Consistente' : 'Inconsistente',
                esConsistente: isConsistent,
                contraejemplo: counterexample
            },
            solidezMaterial: {
                estado: 'No evaluada',
                advertencia: 'La validez formal no demuestra la verdad factual de las premisas. Su verificación requiere evidencia independiente.'
            }
        };
    }
}

const logicEngine = new LogicEngine();
logicEngine.LogicEngine = LogicEngine;
logicEngine.LogicSyntaxError = LogicSyntaxError;
logicEngine.LIMITS = LIMITS;

module.exports = logicEngine;
