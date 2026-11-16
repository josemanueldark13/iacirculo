"use strict";
const zlib = require("node:zlib");
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_TEXT = 1_200_000;

function decodePdfString(value) {
    if (Buffer.isBuffer(value)) {
        if (value.length >= 2 && value[0] === 0xfe && value[1] === 0xff) {
            let output = "";
            for (let i = 2; i + 1 < value.length; i += 2) output += String.fromCharCode(value.readUInt16BE(i));
            return output;
        }
        return value.toString("latin1");
    }
    let output = "";
    const input = String(value ?? "");
    for (let i = 0; i < input.length; i++) {
        if (input[i] !== "\\") { output += input[i]; continue; }
        const next = input[++i];
        if (next === undefined) break;
        if (/[0-7]/.test(next)) {
            let octal = next;
            while (octal.length < 3 && /[0-7]/.test(input[i + 1] || "")) octal += input[++i];
            output += String.fromCharCode(parseInt(octal, 8));
        } else if (next === "n") output += "\n";
        else if (next === "r") output += "\r";
        else if (next === "t") output += "\t";
        else if (next === "b") output += "\b";
        else if (next === "f") output += "\f";
        else if (next === "\n" || next === "\r") {
            if (next === "\r" && input[i + 1] === "\n") i++;
        } else output += next;
    }
    return output;
}
function readLiteral(input, start) {
    let depth = 1, value = "";
    for (let i = start + 1; i < input.length; i++) {
        const char = input[i];
        if (char === "\\") { value += char; if (i + 1 < input.length) value += input[++i]; continue; }
        if (char === "(") depth++;
        if (char === ")" && --depth === 0) return { value, end: i + 1 };
        value += char;
    }
    return null;
}
function collectTextOperands(content) {
    const output = [], blocks = content.match(/BT[\s\S]*?ET/g) || [];
    for (const block of blocks) {
        for (let i = 0; i < block.length; i++) {
            if (block[i] === "(") {
                const literal = readLiteral(block, i);
                if (!literal) continue;
                let j = literal.end;
                while (/\s/.test(block[j] || "")) j++;
                if (/^(Tj|TJ|'|")/.test(block.slice(j))) output.push(decodePdfString(literal.value));
                i = literal.end - 1;
            } else if (block[i] === "<" && block[i + 1] !== "<") {
                const end = block.indexOf(">", i + 1);
                if (end < 0) continue;
                const hex = block.slice(i + 1, end).replace(/\s/g, "");
                if (/^[0-9a-f]+$/i.test(hex)) {
                    const bytes = Buffer.from(hex.length % 2 ? hex + "0" : hex, "hex");
                    let decoded = decodePdfString(bytes);
                    if (bytes.length >= 2 && bytes[0] === 0 && bytes[1] !== 0) {
                        decoded = "";
                        for (let k = 0; k + 1 < bytes.length; k += 2) decoded += String.fromCharCode(bytes.readUInt16BE(k));
                    }
                    let j = end + 1;
                    while (/\s/.test(block[j] || "")) j++;
                    if (/^(Tj|TJ|'|")/.test(block.slice(j))) output.push(decoded);
                }
                i = end;
            }
        }
    }
    return output.join(" ");
}
function extractPdfText(input, options = {}) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || "");
    const maxBytes = Math.max(1024, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
    if (buffer.length > maxBytes) return { ok: false, status: "too_large", error: "PDF_TOO_LARGE", text: "" };
    if (buffer.length < 8 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return { ok: false, status: "invalid_pdf", error: "INVALID_PDF_HEADER", text: "" };
    const raw = buffer.toString("latin1");
    if (/\/Encrypt\b/.test(raw)) return { ok: false, status: "encrypted", error: "ENCRYPTED_PDF", text: "" };
    const chunks = [];
    let offset = 0, streams = 0, decompressionErrors = 0;
    while ((offset = raw.indexOf("stream", offset)) !== -1) {
        const dictStart = raw.lastIndexOf("<<", offset);
        const dict = dictStart >= 0 && offset - dictStart < 4096 ? raw.slice(dictStart, offset) : "";
        let dataStart = offset + 6;
        if (raw[dataStart] === "\r" && raw[dataStart + 1] === "\n") dataStart += 2;
        else if (raw[dataStart] === "\n" || raw[dataStart] === "\r") dataStart++;
        else { offset += 6; continue; }
        const dataEnd = raw.indexOf("endstream", dataStart);
        if (dataEnd < 0) break;
        let bytes = buffer.subarray(dataStart, dataEnd);
        while (bytes.length && (bytes[bytes.length - 1] === 10 || bytes[bytes.length - 1] === 13)) bytes = bytes.subarray(0, bytes.length - 1);
        streams++;
        try {
            if (/\/FlateDecode\b/.test(dict)) bytes = zlib.inflateSync(bytes, { maxOutputLength: maxBytes * 5 });
            else if (/\/Filter\b/.test(dict)) { offset = dataEnd + 9; continue; }
            const decoded = bytes.toString("latin1");
            if (/\bBT\b/.test(decoded) && /\bET\b/.test(decoded)) chunks.push(collectTextOperands(decoded));
        } catch { decompressionErrors++; }
        offset = dataEnd + 9;
        if (chunks.join(" ").length > DEFAULT_MAX_TEXT) break;
    }
    const text = chunks.join(" ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ").replace(/[\t\r ]+/g, " ").replace(/\n\s+/g, "\n").trim().slice(0, DEFAULT_MAX_TEXT);
    if (text.length < 40) return { ok: false, status: "no_extractable_text", error: streams && decompressionErrors === streams ? "PDF_STREAM_DECOMPRESSION_FAILED" : "PDF_TEXT_LAYER_NOT_FOUND", text: "", diagnostics: { streams, decompressionErrors } };
    return { ok: true, status: "extracted", text, characters: text.length, diagnostics: { streams, decompressionErrors, method: "builtin-pdf-text-layer-v1" } };
}
module.exports = { extractPdfText, decodePdfString, collectTextOperands };
