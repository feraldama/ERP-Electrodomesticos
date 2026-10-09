import type { Response } from "express";
import { postPendingEvents, type OrigenContable } from "../services/accounting.js";

/** Header con el motivo cuando una operacion se guardo pero su asiento no se pudo generar. */
export const HEADER_CONTABILIDAD_ERROR = "X-Contabilidad-Error";

/**
 * Postea los asientos de los documentos que acaba de generar una operacion (ya
 * confirmada). Si alguno falla, la operacion igual responde OK pero informa el
 * motivo en el header X-Contabilidad-Error para que el front avise al usuario.
 */
export async function contabilizar(res: Response, companyId: number, origenes: OrigenContable[]): Promise<void> {
  const { errores } = await postPendingEvents(companyId, origenes);
  if (errores.length > 0) res.setHeader(HEADER_CONTABILIDAD_ERROR, encodeURIComponent(errores.join(" | ")));
}
