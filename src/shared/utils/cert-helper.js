const crypto = require('crypto');

/**
 * Formatea un contenido base64 en formato PEM.
 * @param {string} base64Content - Contenido en base64
 * @param {string} type - Tipo de PEM ('PUBLIC KEY', 'PRIVATE KEY' o 'ENCRYPTED PRIVATE KEY')
 * @returns {string} Llave formateada en PEM
 */
function formatPEM(base64Content, type) {
    const cleanBase64 = base64Content.replace(/\s+/g, '');
    const lines = [];
    for (let i = 0; i < cleanBase64.length; i += 64) {
        lines.push(cleanBase64.slice(i, i + 64));
    }
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
}

/**
 * Procesa el buffer del certificado XML/CRT.
 * Extrae el NIT, la clave pública PEM y la clave privada PEM.
 * @param {Buffer} buffer - Buffer del archivo subido
 * @returns {object} { nit, publicKeyPem, privateKeyPem }
 */
function procesarCertificado(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('El archivo proporcionado no es válido o está vacío.');
    }

    const content = buffer.toString('utf8');

    // 1. Extraer NIT
    const nitMatch = content.match(/<nit>([\s\S]*?)<\/nit>/);
    if (!nitMatch) {
        throw new Error('El archivo no contiene un tag <nit> válido.');
    }
    const nit = nitMatch[1].trim();
    if (!/^\d+$/.test(nit)) {
        throw new Error(`El NIT detectado no es válido: ${nit}`);
    }

    // 2. Extraer llave pública
    const pubMatch = content.match(/<publicKey>[\s\S]*?<encodied>([\s\S]*?)<\/encodied>/);
    if (!pubMatch) {
        throw new Error('El archivo no contiene un tag <publicKey> con <encodied> válido.');
    }
    const pubBase64 = pubMatch[1].replace(/\s+/g, '');

    // 3. Extraer llave privada
    const privMatch = content.match(/<privateKey>[\s\S]*?<encodied>([\s\S]*?)<\/encodied>/);
    if (!privMatch) {
        throw new Error('El archivo no contiene un tag <privateKey> con <encodied> válido.');
    }
    const privBase64 = privMatch[1].replace(/\s+/g, '');

    // Extraer clave del certificado
    const claveMatch = content.match(/<privateKey>[\s\S]*?<clave>([\s\S]*?)<\/clave>/);
    const clave = claveMatch ? claveMatch[1].trim() : null;

    // 4. Formatear a PEM
    const publicKeyPem = formatPEM(pubBase64, 'PUBLIC KEY');
    // Nota: Como la clave privada viene encriptada (formato PKCS#8 cifrado de Hacienda),
    // la envolvemos en ENCRYPTED PRIVATE KEY para que Node.js la reconozca como tal.
    const privateKeyPem = formatPEM(privBase64, 'ENCRYPTED PRIVATE KEY');

    // 5. Validar estructuras PEM
    try {
        crypto.createPublicKey({
            key: publicKeyPem,
            format: 'pem'
        });
    } catch (err) {
        throw new Error(`Estructura de llave pública inválida: ${err.message}`);
    }

    try {
        // Para la clave privada encriptada, validamos que tenga formato PEM correcto
        // Intentar parsearla con una clave dummy debe lanzar error de descifrado (bad decrypt)
        // en lugar de error de formato ASN.1 corrupto.
        crypto.createPrivateKey({
            key: privateKeyPem,
            format: 'pem',
            passphrase: 'dummy_passphrase_to_validate_structure'
        });
    } catch (err) {
        // Si el error contiene "bad decrypt" o "decryption", la estructura es válida (solo falló la contraseña)
        const msg = err.message.toLowerCase();
        const esErrorContraseña = msg.includes('bad decrypt') || msg.includes('decipher') || msg.includes('failed') || msg.includes('password');
        if (!esErrorContraseña) {
            throw new Error(`Estructura de llave privada inválida o corrupta: ${err.message}`);
        }
    }

    return {
        nit,
        publicKeyPem,
        privateKeyPem,
        certificadoXml: content,
        clave
    };
}

module.exports = {
    procesarCertificado
};
