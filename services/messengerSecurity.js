"use strict";

const crypto = require("node:crypto");

function verifyMetaSignature(rawBody, signature, appSecret) {
    if (!appSecret || !Buffer.isBuffer(rawBody)) return false;
    if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
        return false;
    }

    const expected = "sha256=" + crypto
        .createHmac("sha256", appSecret)
        .update(rawBody)
        .digest("hex");

    const receivedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    return receivedBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = { verifyMetaSignature };
