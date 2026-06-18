-- Numeracion de asientos unica por empresa (evita correlativos repetidos al procesar)
CREATE UNIQUE INDEX "accounting_entries_companyId_numero_key" ON "accounting_entries"("companyId", "numero");
