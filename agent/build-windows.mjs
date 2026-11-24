#!/usr/bin/env node
/*
 * Gera, em agent/dist, o agente de impressão para Windows:
 *   coliseu-print-agent.exe                 o agente com o Node embutido (Node SEA), sem precisar instalar o Node;
 *   coliseu-print-agent-setup-<versão>.exe  o instalador (NSIS), que é o que vai para o caixa.
 *
 * Roda no Linux ou no Windows:
 *
 *   npm run agent:build-windows
 *   npm run agent:build-windows -- --server https://pdv.sua-loja.com.br   (instalador já com o endereço preenchido)
 *
 * O que faz:
 *   1. baixa uma vez (fica em agent/.cache) o node-<versão>-win-x64.zip oficial do nodejs.org, da MESMA versão do Node
 *      que roda este script (o pacote do agente só funciona nessa versão), e confere o SHA-256 pelo SHASUMS256.txt;
 *   2. junta o agente num único arquivo CommonJS com o esbuild (o Node SEA ainda exige CommonJS);
 *   3. gera o pacote do agente com `node --experimental-sea-config` e o embute numa cópia do node.exe com o postject
 *      (via npx, sem entrar no package.json);
 *   4. compila agent/installer.nsi com o makensis do NSIS. Procura em $MAKENSIS, no PATH, em agent/.cache/nsis (pacote
 *      do Ubuntu extraído) e, no Windows, em Arquivos de Programas. Sem o NSIS, gera só o .exe e avisa.
 *      Linux: `sudo apt install nsis`. Windows: instalador do NSIS em https://nsis.sourceforge.io.
 *
 * Nada é assinado: o Windows pode mostrar "O Windows protegeu o computador" na primeira execução do instalador
 * (Mais informações → Executar assim mesmo).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { unzipSync } from "fflate";

const POSTJECT = "postject@1.0.0-alpha.6";
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, ".cache");
const distDir = path.join(here, "dist");
const version = process.version;
const folder = `node-${version}-win-x64`;
const zipName = `${folder}.zip`;
const baseUrl = `https://nodejs.org/dist/${version}`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const step = (text) => console.log(`\n> ${text}`);

async function cached(name, url) {
  const file = path.join(cacheDir, name);
  if (existsSync(file)) return readFileSync(file);
  console.log(`  baixando ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  writeFileSync(file, data);
  return data;
}

async function windowsNode() {
  mkdirSync(cacheDir, { recursive: true });
  const exe = path.join(cacheDir, `node-${version}-win-x64.exe`);
  const sums = (await cached(`SHASUMS256-${version}.txt`, `${baseUrl}/SHASUMS256.txt`)).toString("utf8");
  const expected = sums.split("\n").map((line) => line.trim().split(/\s+/)).find(([, name]) => name === zipName)?.[0];
  if (!expected) throw new Error(`${zipName} não aparece no SHASUMS256.txt de ${version}.`);
  const zip = await cached(zipName, `${baseUrl}/${zipName}`);
  const actual = sha256(zip);
  if (actual !== expected) {
    rmSync(path.join(cacheDir, zipName), { force: true });
    throw new Error(`SHA-256 do ${zipName} não confere (esperado ${expected}, veio ${actual}). O arquivo foi apagado; rode de novo.`);
  }
  console.log(`  ${zipName} conferido (sha256 ${actual.slice(0, 16)}...)`);
  if (!existsSync(exe)) {
    const entry = `${folder}/node.exe`;
    const files = unzipSync(zip, { filter: (file) => file.name === entry });
    if (!files[entry]) throw new Error(`${entry} não está dentro do ${zipName}.`);
    writeFileSync(exe, files[entry]);
  }
  return exe;
}

step(`Node ${version} para Windows (x64)`);
const nodeExe = await windowsNode();

step("Juntando o agente num arquivo CommonJS");
mkdirSync(distDir, { recursive: true });
const bundle = path.join(distDir, "coliseu-print-agent.cjs");
await build({
  entryPoints: [path.join(here, "coliseu-print-agent.mjs")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: `node${process.versions.node.split(".")[0]}`,
  // import.meta só é usado quando o agente roda como .mjs; no pacote, o caminho vem do próprio .exe.
  logOverride: { "empty-import-meta": "silent" },
});

step("Gerando o pacote do agente (Node SEA)");
const blob = path.join(distDir, "sea-prep.blob");
const seaConfig = path.join(distDir, "sea-config.json");
writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }, null, 2));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

step("Embutindo no node.exe");
const output = path.join(distDir, "coliseu-print-agent.exe");
rmSync(output, { force: true });
copyFileSync(nodeExe, output);
execFileSync("npx", ["--yes", POSTJECT, output, "NODE_SEA_BLOB", blob, "--sentinel-fuse", SEA_FUSE], { stdio: "inherit", shell: process.platform === "win32" });

const describe = (file) => `${file}\n  ${(statSync(file).size / 1024 / 1024).toFixed(1)} MB · sha256 ${sha256(readFileSync(file))}`;

step("Gerando o instalador (NSIS)");
const makensis = findMakensis();
let setup = null;
if (!makensis) {
  console.log("  NSIS não encontrado, então saiu só o .exe do agente. Instale o NSIS (Linux: sudo apt install nsis;");
  console.log("  Windows: https://nsis.sourceforge.io) ou aponte MAKENSIS para o makensis e rode de novo.");
} else {
  const agentVersion = readFileSync(path.join(here, "coliseu-print-agent.mjs"), "utf8").match(/const VERSION = "([\d.]+)"/)?.[1];
  if (!agentVersion) throw new Error("Não achei a VERSION em coliseu-print-agent.mjs.");
  setup = path.join(distDir, `coliseu-print-agent-setup-${agentVersion}.exe`);
  const server = serverOption();
  rmSync(setup, { force: true });
  execFileSync(makensis.command, [
    "-V2", "-INPUTCHARSET", "UTF8",
    `-DVERSION=${agentVersion}`, `-DAGENT_EXE=${output}`, `-DOUT_FILE=${setup}`,
    ...(server ? [`-DSERVER_URL=${server}`] : []),
    path.join(here, "installer.nsi"),
  ], { stdio: "inherit", env: { ...process.env, ...makensis.env } });
  if (server) console.log(`  endereço já preenchido: ${server}`);
}

console.log(`\nPronto:\n${describe(output)}`);
if (setup) {
  console.log(describe(setup));
  console.log("  Leve o instalador ao caixa e tenha à mão o endereço e o token da tela Impressoras.");
} else {
  console.log("  Copie para o caixa junto com o config.json (mesma pasta) e rode coliseu-print-agent.exe --test.");
}

function serverOption() {
  const index = process.argv.indexOf("--server");
  const value = (index >= 0 ? process.argv[index + 1] : process.env.COLISEU_SERVER_URL)?.trim().replace(/\/+$/, "");
  if (!value) return null;
  if (!/^https?:\/\/[^\s"]+$/.test(value)) throw new Error(`--server inválido: ${value}`);
  return value;
}

function findMakensis() {
  if (process.env.MAKENSIS) return { command: process.env.MAKENSIS, env: {} };
  const local = path.join(cacheDir, "nsis", "usr");
  if (existsSync(path.join(local, "bin", "makensis"))) return { command: path.join(local, "bin", "makensis"), env: { NSISDIR: path.join(local, "share", "nsis") } };
  if (process.platform === "win32") {
    for (const base of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]) {
      const file = base && path.join(base, "NSIS", "makensis.exe");
      if (file && existsSync(file)) return { command: file, env: {} };
    }
  }
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["makensis"], { stdio: "ignore" });
    return { command: "makensis", env: {} };
  } catch { return null; }
}
