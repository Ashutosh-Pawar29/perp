/*
  Warnings:

  - The values [Ask,Bid] on the enum `Side` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Side_new" AS ENUM ('SHORT', 'LONG');
ALTER TABLE "Orders" ALTER COLUMN "side" TYPE "Side_new" USING ("side"::text::"Side_new");
ALTER TYPE "Side" RENAME TO "Side_old";
ALTER TYPE "Side_new" RENAME TO "Side";
DROP TYPE "public"."Side_old";
COMMIT;
