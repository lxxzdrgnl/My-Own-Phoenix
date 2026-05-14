/*
  Warnings:

  - You are about to drop the column `rows` on the `Dataset` table. All the data in the column will be lost.
  - You are about to drop the column `rowResults` on the `DatasetRun` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Dataset" DROP COLUMN "rows";

-- AlterTable
ALTER TABLE "DatasetRun" DROP COLUMN "rowResults";
