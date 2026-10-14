import { AppError, errorResponse } from "@/lib/errors";
import { requireSameOrigin } from "@/lib/security";
import { requireApiUser } from "@/modules/auth/session";
import { importFiscalXmlBatch } from "@/modules/fiscal/service";

export const runtime = "nodejs";

const MAX_FILES = 100;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireApiUser("ADMIN");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) throw new AppError("O lote excede o limite de 50 MB.", 413, "FISCAL_IMPORT_TOO_LARGE");
    const form = await request.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (!files.length || files.length > MAX_FILES) throw new AppError("Selecione de 1 a 100 arquivos XML.", 422, "FISCAL_IMPORT_FILE_COUNT");
    if (files.some((file) => file.size > MAX_FILE_BYTES)) throw new AppError("Cada XML pode ter no máximo 5 MB.", 413, "FISCAL_IMPORT_FILE_TOO_LARGE");
    if (files.reduce((total, file) => total + file.size, 0) > MAX_REQUEST_BYTES) throw new AppError("O lote excede o limite de 50 MB.", 413, "FISCAL_IMPORT_TOO_LARGE");
    if (files.some((file) => !file.name.toLowerCase().endsWith(".xml"))) throw new AppError("O lote aceita somente arquivos com extensão .xml.", 422, "FISCAL_IMPORT_FILE_TYPE");
    const documents = await Promise.all(files.map(async (file) => ({ name: file.name, xml: await file.text() })));
    return Response.json(await importFiscalXmlBatch(documents, user.id), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
