import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/session";
export default async function Home() { const user = await getCurrentUser(); if (!user) redirect("/login"); redirect(user.role === "ADMIN" ? "/admin" : "/pdv"); }
