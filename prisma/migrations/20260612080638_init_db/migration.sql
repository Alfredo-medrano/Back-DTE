-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('BASICO', 'PROFESIONAL', 'EMPRESARIAL', 'ILIMITADO');

-- CreateEnum
CREATE TYPE "DteStatus" AS ENUM ('CREADO', 'VALIDADO', 'FIRMADO', 'ENVIADO', 'PROCESADO', 'RECHAZADO', 'ERROR', 'ANULADO', 'CONTINGENCIA');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "plan" "Plan" NOT NULL DEFAULT 'BASICO',
    "tosAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emisores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "nrc" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "codActividad" TEXT NOT NULL,
    "descActividad" TEXT NOT NULL,
    "departamento" TEXT NOT NULL DEFAULT '06',
    "municipio" TEXT NOT NULL DEFAULT '14',
    "complemento" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "codEstableMH" TEXT NOT NULL DEFAULT 'M001',
    "codPuntoVentaMH" TEXT NOT NULL DEFAULT 'P001',
    "tipoEstablecimiento" TEXT NOT NULL DEFAULT '01',
    "mhClaveApi" TEXT NOT NULL,
    "mhClavePrivada" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT '00',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "contingenciaManual" BOOLEAN NOT NULL DEFAULT false,
    "contingenciaTipo" INTEGER NOT NULL DEFAULT 1,
    "contingenciaMotivo" TEXT NOT NULL DEFAULT 'NO DISPONIBILIDAD DE SISTEMA DEL MH',
    "contingenciaFInicio" TEXT,
    "contingenciaHInicio" TEXT,
    "correlativoFE" INTEGER NOT NULL DEFAULT 1,
    "correlativoCCF" INTEGER NOT NULL DEFAULT 1,
    "correlativoNC" INTEGER NOT NULL DEFAULT 1,
    "correlativoND" INTEGER NOT NULL DEFAULT 1,
    "correlativoFSE" INTEGER NOT NULL DEFAULT 1,
    "correlativoNR" INTEGER NOT NULL DEFAULT 1,
    "correlativoFEX" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emisores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT '00',
    "permisos" TEXT[] DEFAULT ARRAY['dte:create', 'dte:read']::TEXT[],
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emisorId" TEXT NOT NULL,
    "codigoGeneracion" TEXT NOT NULL,
    "numeroControl" TEXT NOT NULL,
    "tipoDte" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ambiente" TEXT NOT NULL DEFAULT '00',
    "tipoContingencia" TEXT,
    "motivoContin" TEXT,
    "fechaLimiteTransmision" TIMESTAMP(3),
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "horaEmision" TEXT NOT NULL,
    "receptorTipoDoc" TEXT NOT NULL,
    "receptorNumDoc" TEXT NOT NULL,
    "receptorNombre" TEXT NOT NULL,
    "receptorCorreo" TEXT,
    "totalGravada" DECIMAL(12,2) NOT NULL,
    "totalIva" DECIMAL(12,2) NOT NULL,
    "totalPagar" DECIMAL(12,2) NOT NULL,
    "status" "DteStatus" NOT NULL DEFAULT 'CREADO',
    "selloRecibido" TEXT,
    "fechaProcesamiento" TIMESTAMP(3),
    "observaciones" TEXT,
    "jsonOriginal" JSONB NOT NULL,
    "jsonFirmado" TEXT,
    "errorLog" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dtes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "details" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "emisores_tenantId_nit_key" ON "emisores"("tenantId", "nit");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "dtes_codigoGeneracion_key" ON "dtes"("codigoGeneracion");

-- CreateIndex
CREATE INDEX "dtes_tenantId_fechaEmision_idx" ON "dtes"("tenantId", "fechaEmision");

-- CreateIndex
CREATE INDEX "dtes_emisorId_tipoDte_idx" ON "dtes"("emisorId", "tipoDte");

-- CreateIndex
CREATE INDEX "dtes_status_idx" ON "dtes"("status");

-- CreateIndex
CREATE INDEX "dtes_emisorId_fechaEmision_status_idx" ON "dtes"("emisorId", "fechaEmision", "status");

-- CreateIndex
CREATE INDEX "dtes_status_intentos_idx" ON "dtes"("status", "intentos");

-- CreateIndex
CREATE INDEX "dtes_status_fechaLimiteTransmision_idx" ON "dtes"("status", "fechaLimiteTransmision");

-- CreateIndex
CREATE UNIQUE INDEX "dtes_emisorId_numeroControl_key" ON "dtes"("emisorId", "numeroControl");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_timestamp_idx" ON "audit_logs"("actorId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_action_timestamp_idx" ON "audit_logs"("action", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- AddForeignKey
ALTER TABLE "emisores" ADD CONSTRAINT "emisores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtes" ADD CONSTRAINT "dtes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtes" ADD CONSTRAINT "dtes_emisorId_fkey" FOREIGN KEY ("emisorId") REFERENCES "emisores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
