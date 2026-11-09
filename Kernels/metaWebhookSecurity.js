const crypto = require("crypto");

/**
 * Fail-closed verification for Meta's X-Hub-Signature-256 header.
 * The caller must separately treat a missing App Secret as a configuration error.
 */
function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
    if (!appSecret || !Buffer.isBuffer(rawBody) || !signatureHeader) {
        return false;
    }

    const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signatureHeader).trim());
    if (!match) return false;

    const expected = crypto
        .createHmac("sha256", appSecret)
        .update(rawBody)
        .digest();

    const received = Buffer.from(match[1], "hex");
    return received.length === expected.length &&
        crypto.timingSafeEqual(received, expected);
}

module.exports = { verifyMetaSignature };
