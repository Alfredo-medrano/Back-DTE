/**
 * ========================================
 * ÍNDICE BD COMPARTIDA
 * ========================================
 */

const { prisma } = require('./prisma');
const { conReintento, esErrorConexion } = require('./prisma-resilient');

module.exports = {
    prisma,
    conReintento,
    esErrorConexion,
};
