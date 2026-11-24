/* Páginas de código das impressoras térmicas ESC/POS. Cada tabela lista os caracteres dos bytes 0x80 a 0xFF; abaixo
 * de 0x80 todas seguem o ASCII. `command` é o número enviado em `ESC t n` para a impressora trocar de tabela.
 * A POS-8370 (genérica de 80 mm) imprimiu os acentos certos só em CP860; as outras ficam para impressoras diferentes. */
export const codePages = {
  CP860: {
    label: "CP860 (português)",
    command: 3,
    high: "ÇüéâãàÁçêÊèÍÔìÃÂÉÀÈôõòÚùÌÕÜ¢£Ù₧ÓáíóúñÑªº¿Ò¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ",
  },
  CP850: {
    label: "CP850 (multilíngue)",
    command: 2,
    high: "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ",
  },
  WPC1252: {
    label: "WPC1252 (Windows Latin)",
    command: 16,
    high: "€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ",
  },
  ASCII: {
    label: "Sem acentos (ASCII)",
    command: 0,
    high: "",
  },
} as const;

export type CodePage = keyof typeof codePages;
export const codePageNames = Object.keys(codePages) as CodePage[];
export const isCodePage = (value: string): value is CodePage => value in codePages;

const lookups = new Map<CodePage, Map<string, number>>();
function lookup(page: CodePage) {
  let table = lookups.get(page);
  if (!table) {
    table = new Map();
    const high = codePages[page].high;
    for (let index = 0; index < high.length; index++) if (high[index] !== "�") table.set(high[index], 0x80 + index);
    lookups.set(page, table);
  }
  return table;
}

/* Símbolos tipográficos comuns que nenhuma tabela tem e viram o equivalente simples. */
const plain: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": "\"", "”": "\"", "…": "...", "•": "*", " ": " " };

/** Converte o texto para os bytes da página de código. O que a tabela não tem perde o acento (é → e) ou vira "?". */
export function encodeText(text: string, page: CodePage): number[] {
  const table = lookup(page);
  const bytes: number[] = [];
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0)!;
    if (code === 0x0a) { bytes.push(0x0a); continue; }
    if (code === 0x09) { bytes.push(0x20); continue; }
    if (code < 0x20 || code === 0x7f) continue;
    if (code < 0x80) { bytes.push(code); continue; }
    const mapped = table.get(char);
    if (mapped !== undefined) { bytes.push(mapped); continue; }
    const replacement = plain[char] ?? char.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (replacement !== char && [...replacement].every((part) => part.charCodeAt(0) < 0x80)) bytes.push(...[...replacement].map((part) => part.charCodeAt(0)));
    else bytes.push(0x3f);
  }
  return bytes;
}
