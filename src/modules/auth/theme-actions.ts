"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pool } from "@/db";
import { requireUser, type UserTheme } from "./session";

const themeSchema = z.enum(["LIGHT", "DARK", "SYSTEM"]);

export async function updateThemeAction(theme: UserTheme) {
  const user = await requireUser();
  const parsed = themeSchema.parse(theme);
  await pool.query("UPDATE users SET theme=$1,updated_at=now() WHERE id=$2", [parsed, user.id]);
  await pool.query(
    "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,after) VALUES ($1::uuid,'THEME_UPDATE','user',$1::text,$2::jsonb)",
    [user.id, JSON.stringify({ theme: parsed })],
  );
  revalidatePath("/", "layout");
  return { theme: parsed };
}
