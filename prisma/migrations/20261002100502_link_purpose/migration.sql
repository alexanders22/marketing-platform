-- CreateEnum
CREATE TYPE "LinkPurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "MagicLink" ADD COLUMN     "purpose" "LinkPurpose" NOT NULL DEFAULT 'LOGIN';

