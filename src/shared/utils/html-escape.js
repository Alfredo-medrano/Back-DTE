/**
 * ========================================
 * UTILS: HTML ESCAPE
 * ========================================
 * Previene vulnerabilidades de inyección HTML y XSS
 * codificando caracteres especiales a sus respectivas entidades HTML.
 */

const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

module.exports = { escapeHtml };
