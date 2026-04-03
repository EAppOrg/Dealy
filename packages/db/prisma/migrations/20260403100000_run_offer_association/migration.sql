-- CreateTable
CREATE TABLE "run_offers" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,

    CONSTRAINT "run_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "run_offers_offerId_idx" ON "run_offers"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "run_offers_runId_offerId_key" ON "run_offers"("runId", "offerId");

-- AddForeignKey
ALTER TABLE "run_offers" ADD CONSTRAINT "run_offers_runId_fkey" FOREIGN KEY ("runId") REFERENCES "retrieval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_offers" ADD CONSTRAINT "run_offers_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
