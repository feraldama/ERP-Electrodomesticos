-- Deja solo el motivo inicial (2303); los demas los carga el usuario en FINM010.
-- No borra motivos que ya se usaron en documentos anulados.
DELETE FROM "motivos_anulacion" m
WHERE m."codigo" IN ('2301', '2302', '2304', '2305', '2306')
  AND NOT EXISTS (SELECT 1 FROM "sales_invoices" s WHERE s."motivoAnulacionId" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "purchase_invoices" p WHERE p."motivoAnulacionId" = m."id");
