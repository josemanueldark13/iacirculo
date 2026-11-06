#!/usr/bin/env node
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runSemanticRegression } from "./semantic-regression-suite.mjs";
import { resolveSemanticFrame, validateSemanticFrame } from "./seman-validator.mjs";

const require = createRequire(import.meta.url);
const modulePath = process.argv[2] || "../Kernels/semanticAnalyzer.js";

let analyzerModule;
try {
  analyzerModule = modulePath.startsWith(".") || modulePath.startsWith("/")
    ? require(resolve(modulePath))
    : require(modulePath);
} catch (error) {
  console.error("No se pudo cargar el módulo analizador:", error);
  process.exit(2);
}

const analyze = analyzerModule.analyzeFrame ?? analyzerModule.analyze ?? analyzerModule.analyzeText;
if (typeof analyze !== "function") {
  console.error("El módulo debe exportar analyzeFrame(input), analyze(input) o analyzeText(input).");
  process.exit(2);
}

const structuralFailures = [];
const wrappedAnalyzer = async input => {
  const output = await analyze(input);
  const validation = validateSemanticFrame(output);
  if (!validation.valid) {
    structuralFailures.push({ input: input.text, errors: validation.errors });
  }
  return validation.valid ? resolveSemanticFrame(output).frame : output;
};

const report = await runSemanticRegression(wrappedAnalyzer);
console.log(JSON.stringify({
  status: report.passed && structuralFailures.length === 0 ? "PASS" : "FAIL",
  analyzer: modulePath,
  regression: report,
  structuralFailures
}, null, 2));

if (!report.passed || structuralFailures.length > 0) process.exitCode = 1;
