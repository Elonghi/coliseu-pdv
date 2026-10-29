const fields: Record<string, string> = { name: "Nome", document: "CNPJ", email: "E-mail", phone: "Telefone", notes: "Observações", reason: "Motivo", quantity: "Quantidade", amount: "Valor", sku: "SKU", barcode: "Código de barras", password: "Senha" };

type Issue = { code?: string; path?: (string | number)[]; message?: string; format?: string };
const isDefaultEnglish = (message?: string) => !message || /^(Invalid|Too (small|big)|Required|Expected|Unrecognized)/.test(message);

function describe(issue: Issue) {
  if (!isDefaultEnglish(issue.message)) return issue.message!;
  if (issue.code === "invalid_format") return issue.format === "email" ? "e-mail inválido." : "formato inválido.";
  if (issue.code === "too_small") return "valor curto ou pequeno demais.";
  if (issue.code === "too_big") return "valor longo ou grande demais.";
  if (issue.code === "invalid_type") return "preenchimento obrigatório ou inválido.";
  return "valor inválido.";
}

/** Erros de validação (Zod) chegam como JSON; transformamos em uma frase que a pessoa entenda. */
export function readableError(text?: string) {
  if (!text?.trimStart().startsWith("[")) return text;
  try {
    const issues = JSON.parse(text) as Issue[];
    if (!Array.isArray(issues) || !issues.length || !issues.every((issue) => issue && typeof issue === "object" && "code" in issue)) return text;
    const lines = issues.slice(0, 3).map((issue) => {
      const key = String(issue.path?.at(-1) ?? "");
      const label = fields[key] ?? key;
      const detail = describe(issue);
      return isDefaultEnglish(issue.message) && label ? `${label}: ${detail}` : detail;
    });
    return `Confira os dados informados. ${lines.join(" ")}`;
  } catch { return text; }
}
