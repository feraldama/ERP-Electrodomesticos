-- Convencion de fechas contables: un dia = medianoche UTC de ese dia (igual que
-- las fechas de documento, que llegan como "YYYY-MM-DD"). Antes los ejercicios
-- y los asientos de anulacion se guardaban en hora local de Paraguay, lo que
-- corria un dia los limites de cada ejercicio. Solo datos; sin cambios de esquema.

-- 1) Ejercicios: limites a 00:00:00.000 / 23:59:59.999 UTC del dia local original.
UPDATE "fiscal_periods" SET
  "fechaInicio" = ((("fechaInicio" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Asuncion')::date)::timestamp(3),
  "fechaFin" = ((("fechaFin" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Asuncion')::date)::timestamp(3)
    + interval '23 hours 59 minutes 59.999 seconds'
WHERE "fechaInicio"::time <> time '00:00:00';

-- 2) Asientos fechados con un instante real (anulaciones, reversas, cierre): al dia local.
UPDATE "accounting_entries" SET
  "fecha" = ((("fecha" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Asuncion')::date)::timestamp(3)
WHERE "fecha"::time <> time '00:00:00';

-- 3) Reasignar el ejercicio de cada asiento segun su fecha, sin tocar ejercicios cerrados.
UPDATE "accounting_entries" e SET "periodId" = p."id"
FROM "fiscal_periods" p
WHERE p."companyId" = e."companyId"
  AND e."fecha" BETWEEN p."fechaInicio" AND p."fechaFin"
  AND e."periodId" IS DISTINCT FROM p."id"
  AND p."cerrado" = false
  AND (e."periodId" IS NULL OR e."periodId" IN (SELECT "id" FROM "fiscal_periods" WHERE "cerrado" = false));
