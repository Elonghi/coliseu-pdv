import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AppError } from "@/lib/errors";

const storageRoot = process.env.STORAGE_PATH
  ? path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_PATH)
  : path.join(process.cwd(), "storage");
const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function saveProductImage(file: File) {
  if (!allowed.has(file.type)) throw new AppError("Use uma imagem JPEG, PNG ou WebP.", 422);
  if (file.size > 5 * 1024 * 1024) throw new AppError("A imagem deve ter no máximo 5 MB.", 422);
  const key = `products/${randomUUID()}.${allowed.get(file.type)}`;
  const full = path.join(storageRoot, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  return key;
}

export function resolveStorageKey(key: string) {
  const full = path.resolve(storageRoot, key);
  if (!full.startsWith(`${storageRoot}${path.sep}`)) throw new AppError("Arquivo inválido.", 400);
  return full;
}
export async function removeImage(key?: string | null) { if (key) await unlink(resolveStorageKey(key)).catch(() => undefined); }
