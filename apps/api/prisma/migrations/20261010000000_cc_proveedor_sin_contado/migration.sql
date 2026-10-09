-- Cuenta corriente proveedor: una compra de CONTADO se paga en el acto (su asiento
-- acredita Caja), asi que no genera deuda con el proveedor. Antes se registraba su
-- total como haber (y su anulacion como debe), inflando el saldo a pagar y
-- descuadrando la cuenta corriente contra la cuenta contable Proveedores. Se quitan
-- esos movimientos; idempotente. Solo datos.
DELETE FROM "supplier_account_entries" sae
USING "purchase_invoices" pi
WHERE sae."origenTipo" IN ('COMPRA', 'ANULACION_COMPRA')
  AND sae."origenId" = pi."id"
  AND pi."condicion" = 'CONTADO';
