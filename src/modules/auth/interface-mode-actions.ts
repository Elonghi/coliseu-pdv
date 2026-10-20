"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pool } from "@/db";
import { requireUser, type InterfaceMode } from "./session";

const interfaceModeSchema = z.enum(["LEGACY", "MODERN"]);

export async function updateInterfaceModeAction(mode: InterfaceMode) {
  const user = await requireUser();
  const parsed = interfaceModeSchema.parse(mode);
  await pool.query("UPDATE users SET interface_mode=$1,updated_at=now() WHERE id=$2", [parsed, user.id]);
  await pool.query(
    "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1::uuid,'INTERFACE_MODE_UPDATE','user',$1::text,$2::jsonb)",
    [user.id, JSON.stringify({ interfaceMode: parsed })],
  );
  revalidatePath("/", "layout");
  return { interfaceMode: parsed };
}
