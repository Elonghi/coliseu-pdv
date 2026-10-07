import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse } from "@/lib/errors";
import { requireApiUser } from "@/modules/auth/session";
import { resolveStorageKey } from "@/modules/catalog/storage";

const contentType: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
export async function GET(_: Request, context: { params: Promise<{ path: string[] }> }) {
  try { await requireApiUser(); const params = await context.params; const file = resolveStorageKey(params.path.join("/")); return new Response(await readFile(file), { headers: { "Content-Type": contentType[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } }); }
  catch (error) { return errorResponse(error); }
}
