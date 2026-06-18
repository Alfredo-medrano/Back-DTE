-- CreateTable
CREATE TABLE "clientes_crm" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_crm_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clientes_crm" ADD CONSTRAINT "clientes_crm_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "clientes_crm_tenant_id_nit_idx" ON "clientes_crm" ("tenant_id", (data->>'nit'));
