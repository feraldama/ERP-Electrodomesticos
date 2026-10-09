-- CreateIndex
CREATE INDEX "accounting_entries_companyId_origenTipo_origenId_idx" ON "accounting_entries"("companyId", "origenTipo", "origenId");

-- CreateIndex
CREATE INDEX "accounting_events_companyId_origenTipo_origenId_idx" ON "accounting_events"("companyId", "origenTipo", "origenId");
