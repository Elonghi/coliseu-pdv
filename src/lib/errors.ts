import { ZodError } from "zod";

export class AppError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "BAD_REQUEST") { super(message); }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Dados inválidos.", code: "VALIDATION_ERROR" }, { status: 422 });
  console.error(error);
  return Response.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
}
