import { pool } from "@/db";
import { PosClient } from "@/components/pos-client";
import { requireUser } from "@/modules/auth/session";
export const dynamic="force-dynamic";
export default async function PosPage(){const user=await requireUser();const methods=await pool.query("SELECT code,name FROM payment_methods WHERE active=true ORDER BY sort_order");return <PosClient methods={methods.rows} userName={user.name} isAdmin={user.role==="ADMIN"}/>}
