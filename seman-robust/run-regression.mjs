#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runSemanticRegression } from "./semantic-regression-suite.mjs";
import { validateSemanticFrame } from "./seman-validator.mjs";

const modulePath = process.argv[2];
if (!modulePath) {
  console.error("Uso: node run-regression.mjs <ruta/al/modulo-analizador.mjs>");
  process.exit(2);
}

let analyzerModule;
try {
  analyzerModule = await import(pathToFileURL(resolve(modulePath)).href);
} catch (error) {
  console.error("No se pudo cargar el módulo analizador:", error);
  process.exit(2);
}

const analyze = analyzerModule.analyze ?? analyzerModule.analyzeText;
if (typeof analyze !== "function") {
  console.error("El módulo debe exportar analyze(input) o analyzeText(input).");
  process.exit(2);
}

const structuralFailures = [];
const wrappedAnalyzer = async input => {
  const output = await analyze(input);
  const validation = validateSemanticFrame(output);
  if (!validation.valid) {
    structuralFailures.push({
      input: input.text,
      errors: validation.errors
    });
  }
  return validation.valid ? (validation.framePath === "$" ? output : output.result ?? output.data) : output;
};

const report = await runSemanticRegression(wrappedAnalyzer);
console.log(JSON.stringify({
  status: report.passed && structuralFailures.length === 0 ? "PASS" : "FAIL",
  regression: report,
  structuralFailures
}, null, 2));

if (!report.passed || structuralFailures.length > 0) process.exitCode = 1;
