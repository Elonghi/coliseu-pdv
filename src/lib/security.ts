import { AppError } from "./errors";

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? request.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new AppError("Origem da requisição não permitida.", 403, "INVALID_ORIGIN");
}

export function shouldUseSecureSessionCookie(
  environment = process.env.NODE_ENV,
  configured = process.env.SESSION_COOKIE_SECURE,
) {
  if (configured === "true") return true;
  if (configured === "false") return false;
  return environment === "production";
}
