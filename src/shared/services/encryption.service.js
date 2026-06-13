const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Obtiene y valida la clave maestra de cifrado.
 * @returns {Buffer} Clave de cifrado de 32 bytes
 */
function getEncryptionKey() {
    const key = process.env.MASTER_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('MASTER_ENCRYPTION_KEY no está configurada en las variables de entorno.');
    }
    if (Buffer.byteLength(key, 'utf8') !== 32) {
        throw new Error('MASTER_ENCRYPTION_KEY debe tener exactamente 32 caracteres (bytes).');
    }
    return Buffer.from(key, 'utf8');
}

/**
 * Cifra un texto plano utilizando AES-256-GCM.
 * @param {string} plainText - Texto a cifrar
 * @returns {string} Texto cifrado en formato iv:authTag:content (hex)
 */
function encrypt(plainText) {
    if (!plainText) return plainText;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');
    
    return `${ivHex}:${authTag}:${encrypted}`;
}

/**
 * Descifra un texto cifrado utilizando AES-256-GCM.
 * @param {string} encryptedText - Texto cifrado en formato iv:authTag:content (hex)
 * @returns {string} Texto original descifrado
 */
function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Formato de texto cifrado inválido para descifrado.');
    }
    
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

module.exports = {
    encrypt,
    decrypt
};
