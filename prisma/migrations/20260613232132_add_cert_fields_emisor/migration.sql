-- AlterTable
ALTER TABLE "emisores" ADD COLUMN     "certUploadedAt" TIMESTAMP(3),
ADD COLUMN     "mhPrivateKey" TEXT,
ADD COLUMN     "mhPublicKey" TEXT;
