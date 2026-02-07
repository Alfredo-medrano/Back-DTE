/**
 * ========================================
 * ÍNDICE DE SERVICIOS DTE
 * Módulo: DTE
 * ========================================
 */

const dteOrchestrator = require('./dte-orchestrator.service');
const dteCalculator = require('./dte-calculator.service');
const signer = require('./signer.service');
const mhSender = require('./mh-sender.service');

module.exports = {
    dteOrchestrator,
    dteCalculator,
    signer,
    mhSender,
};
