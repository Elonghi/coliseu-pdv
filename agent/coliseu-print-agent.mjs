#!/usr/bin/env node
/*
 * Agente de impressão do Coliseu PDV.
 *
 * Roda no computador onde a impressora térmica está ligada (Windows ou Linux), busca no servidor os comprovantes da
 * fila desta impressora e repassa os bytes ESC/POS sem alterar nada. A conexão sai do caixa para o servidor, então
 * não precisa abrir porta nem dar permissão no navegador.
 *
 * Requisito: Node.js 20 ou mais novo. Não usa nenhum pacote externo. No Windows, o normal é usar o instalador
 * coliseu-print-agent-setup-<versão>.exe (gerado por agent/build-windows.mjs junto com o coliseu-print-agent.exe, que
 * já traz o Node dentro): ele pede o endereço e o token, confere com o servidor, lista as impressoras e liga o agente.
 *
 * Uso (troque "node coliseu-print-agent.mjs" por "coliseu-print-agent.exe" no executável):
 *   node coliseu-print-agent.mjs                  liga o agente (lê o config.json da mesma pasta)
 *   node coliseu-print-agent.mjs --test           imprime uma página de teste local, sem falar com o servidor
 *   node coliseu-print-agent.mjs --list           lista as impressoras do sistema
 *   node coliseu-print-agent.mjs --config C:\caminho\config.json
 *   node coliseu-print-agent.mjs --log arquivo.log   grava o registro também em arquivo (o .exe já grava ao lado dele)
 *   node coliseu-print-agent.mjs --instalar       Windows, como administrador: liga junto com o Windows, sem janela
 *   node coliseu-print-agent.mjs --desinstalar    Windows, como administrador: desfaz o --instalar
 *
 * Usados pelo instalador (também servem à mão):
 *   --verificar  [--server URL] [--token TOKEN]   confere o token no servidor e diz de qual loja e impressora ele é
 *   --configurar [--server URL] [--token TOKEN] [--printer NOME]   grava o config.json (o que faltar vem do atual)
 *   --resultado arquivo.txt   grava a mensagem final em UTF-16LE, que o instalador mostra com os acentos certos
 *   Saída: 0 deu certo, 2 dado errado (token recusado, faltando, endereço inválido), 3 sem conexão, 1 outro erro.
 *
 * config.json (gerado na tela Impressoras do painel):
 *   { "server": "https://pdv.sua-loja.com.br", "token": "cpa1....", "printer": "POS-8370" }
 *
 * "printer" aceita:
 *   - o nome da impressora no sistema (Linux: fila do CUPS em modo raw, veja `lpstat -e`; Windows: nome em
 *     Impressoras e scanners, com o driver do fabricante instalado);
 *   - um dispositivo, como "/dev/usb/lp0" (Linux, exige permissão de escrita, normalmente o grupo `lp`);
 *   - uma impressora de rede, como "tcp://192.168.0.50:9100".
 *
 * Ligar junto com o computador:
 *   Linux (systemd, como o seu usuário):
 *     ~/.config/systemd/user/coliseu-print.service com
 *       [Service]
 *       ExecStart=/usr/bin/node /opt/coliseu/coliseu-print-agent.mjs --config /opt/coliseu/config.json
 *       Restart=always
 *       [Install]
 *       WantedBy=default.target
 *     e depois: systemctl --user enable --now coliseu-print  (e `loginctl enable-linger` para rodar sem login)
 *   Windows: rode uma vez, num Prompt aberto como administrador, `coliseu-print-agent.exe --instalar`. Ele cria a
 *     tarefa "Coliseu PDV - Impressao" no Agendador de Tarefas: começa com o Windows, roda como sistema (sem janela),
 *     não para depois de 3 dias nem na bateria e é reiniciada se cair.
 */
import { spawn } from "node:child_process";
import { appendFileSync, renameSync, statSync } from "node:fs";
import { open, readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.3.0";
const WAIT_SECONDS = 25;
/* Empacotado como executável (Node SEA), o config.json e o registro ficam ao lado do .exe; como script, ao lado do .mjs. */
const packaged = Boolean(process.getBuiltinModule?.("node:sea")?.isSea?.());
const scriptFile = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
const here = packaged ? path.dirname(process.execPath) : path.dirname(scriptFile);
const TASK_NAME = "Coliseu PDV - Impressao";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

let logFile = null;
/* Sem console (rodando escondido pelo instalador ou pela tarefa), escrever na tela não pode derrubar o agente. */
function say(text) {
  try { console.log(text); } catch { /* sem console */ }
}
function log(...parts) {
  const line = [new Date().toISOString(), ...parts].join(" ");
  say(line);
  if (logFile) try { appendFileSync(logFile, line + os.EOL); } catch { /* sem disco: segue só na tela */ }
}
/* Mantém o registro pequeno: acima de 2 MB, o atual vira .1 e começa outro. */
function openLog(file) {
  try { if (statSync(file).size > 2_000_000) renameSync(file, `${file}.1`); } catch { /* ainda não existe */ }
  logFile = file;
}
/* Cabeçalho HTTP só aceita ASCII com segurança. */
const headerSafe = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Erro com código de saída próprio, para o instalador saber se volta à tela (2) ou se pode seguir sem internet (3). */
class ExitError extends Error {
  constructor(message, exitCode) { super(message); this.exitCode = exitCode; }
}

const configPath = () => path.resolve(option("--config") ?? path.join(here, "config.json"));

async function loadConfig() {
  const file = configPath();
  let config;
  try { config = JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw new Error(`Não consegui ler ${file}: ${error.message}`); }
  for (const key of ["server", "token", "printer"]) if (!config[key] || typeof config[key] !== "string") throw new Error(`Falta "${key}" em ${file}.`);
  return { ...config, server: config.server.replace(/\/+$/, ""), file };
}

/* ---------------- envio dos bytes para a impressora ---------------- */

function run(command, commandArgs, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { env: { ...process.env, ...env }, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(output.trim() || `${command} terminou com código ${code}`)));
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

function printTcp(target, data) {
  const url = new URL(target);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: url.hostname, port: Number(url.port || 9100) });
    socket.setTimeout(10_000, () => socket.destroy(new Error("Tempo esgotado falando com a impressora de rede.")));
    socket.on("error", reject);
    socket.on("connect", () => socket.end(data));
    socket.on("close", (hadError) => { if (!hadError) resolve(); });
  });
}

async function printDevice(device, data) {
  const handle = await open(device, "w");
  try { await handle.write(data); } finally { await handle.close(); }
}

/* Windows: manda os bytes "RAW" pelo spooler (OpenPrinter/WritePrinter do winspool.drv), via PowerShell que já vem
 * no sistema. O nome da impressora e o arquivo vão por variável de ambiente, nunca montados no texto do script. */
const windowsRawScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ColiseuRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr handle;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Impressora nao encontrada: " + printer);
    try {
      DOCINFO info = new DOCINFO(); info.pDocName = "Coliseu PDV"; info.pDataType = "RAW";
      if (StartDocPrinter(handle, 1, info) == 0) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      try {
        StartPagePrinter(handle);
        int written;
        if (!WritePrinter(handle, data, data.Length, out written) || written != data.Length) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        EndPagePrinter(handle);
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
"@
[ColiseuRawPrinter]::Send($env:COLISEU_PRINTER, [System.IO.File]::ReadAllBytes($env:COLISEU_FILE))
`;
const encodedPowerShell = (script) => Buffer.from(script, "utf16le").toString("base64");

async function printWindows(printer, data) {
  const file = path.join(os.tmpdir(), `coliseu-print-${process.pid}-${Date.now()}.bin`);
  await writeFile(file, data);
  try { await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedPowerShell(windowsRawScript)], { env: { COLISEU_PRINTER: printer, COLISEU_FILE: file } }); }
  finally { await unlink(file).catch(() => undefined); }
}

async function sendToPrinter(printer, data) {
  if (printer.startsWith("tcp://")) return printTcp(printer, data);
  if (printer.startsWith("/dev/")) return printDevice(printer, data);
  if (process.platform === "win32") return printWindows(printer, data);
  await run("lp", ["-d", printer, "-o", "raw", "-t", "Coliseu PDV"], { input: data });
}

async function listPrinters() {
  if (process.platform === "win32") return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Printer | Select-Object Name,DriverName,PortName | Format-Table -AutoSize"]);
  return run("lpstat", ["-e"]);
}

/* Página de teste montada aqui mesmo, para conferir a impressora antes de ligar o agente ao servidor. */
function localTestPage(config) {
  const ascii = (text) => Buffer.from(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), "ascii");
  return Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 1, 0x1d, 0x21, 0x11]), ascii("TESTE LOCAL\n"),
    Buffer.from([0x1d, 0x21, 0x00]), ascii(`Agente ${VERSION} - ${os.hostname()}\n`), ascii(`Impressora: ${config.printer}\n`),
    ascii(`${new Date().toLocaleString("pt-BR")}\n\n`), ascii("Se saiu, o agente fala com a impressora.\n"),
    Buffer.from([0x1b, 0x64, 2, 0x1d, 0x56, 66, 3]),
  ]);
}

/* ---------------- conversa com o servidor ---------------- */

async function request(config, pathname, init = {}) {
  return fetch(`${config.server}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${config.token}`, "x-agent-info": headerSafe(`agente ${VERSION} | ${os.hostname()} | ${process.platform} | ${config.printer ?? "-"}`), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout((WAIT_SECONDS + 20) * 1000),
  });
}

async function report(config, id, ok, error) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await request(config, `/api/print/agent/jobs/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ok ? { ok } : { ok, error }) });
      if (response.ok || response.status === 404) return;
      log(`Servidor recusou a resposta do trabalho ${id}: HTTP ${response.status}`);
    } catch (cause) { log(`Falha ao responder o trabalho ${id}: ${cause.message}`); }
    await sleep(attempt * 2000);
  }
}

async function loop(config) {
  log(`Agente ${VERSION} ligado. Servidor ${config.server}, impressora "${config.printer}".`);
  let backoff = 2000;
  let connected = false;
  for (;;) {
    try {
      // A primeira busca volta na hora, para confirmar logo o token e a conexão; as seguintes esperam no servidor.
      const response = await request(config, `/api/print/agent/next?wait=${connected ? WAIT_SECONDS : 0}`);
      if (response.status === 401) { log("Token recusado: gere um novo config.json na tela Impressoras do painel. Tentando de novo em 60 s."); connected = false; await sleep(60_000); continue; }
      if (!response.ok && response.status !== 204) throw new Error(`HTTP ${response.status}`);
      if (!connected) { log("Conectado ao servidor, aguardando impressões."); connected = true; }
      backoff = 2000;
      if (response.status === 204) continue;
      const job = await response.json();
      try {
        await sendToPrinter(config.printer, Buffer.from(job.data, "base64"));
        log(`Impresso: ${job.kind} ${job.id}`);
        await report(config, job.id, true);
      } catch (cause) {
        log(`Falha ao imprimir ${job.id}: ${cause.message}`);
        await report(config, job.id, false, cause.message);
      }
    } catch (cause) {
      if (connected) log(`Conexão com o servidor caiu: ${networkReason(cause)}`);
      else log(`Sem conexão com o servidor: ${networkReason(cause)} Nova tentativa em ${backoff / 1000} s.`);
      connected = false;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

/* ---------------- instalador: conferir o token e gravar a configuração ---------------- */

/* Parte do config.json atual (se houver) e troca pelo que vier em --server, --token e --printer. Assim, ao atualizar,
 * o instalador pode deixar o token em branco e manter o que já está no computador. */
async function configFromOptions() {
  const file = configPath();
  let current = {};
  try { current = JSON.parse(await readFile(file, "utf8")); } catch { /* ainda não existe */ }
  const config = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
  for (const key of ["server", "token", "printer"]) {
    const value = option(`--${key}`)?.trim();
    if (value) config[key] = value;
  }
  if (typeof config.server === "string") config.server = config.server.replace(/\/+$/, "");
  return { config, file };
}

/* Explica em português os erros de rede mais comuns no caixa (relógio errado quebra o certificado HTTPS, por exemplo). */
function networkReason(error) {
  const code = error.cause?.code ?? error.code ?? error.name;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "o endereço não foi encontrado. Confira se está escrito certo e se o computador tem internet.";
  if (code === "ECONNREFUSED") return "a conexão foi recusada. Confira o endereço e a porta.";
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT" || code === "TimeoutError") return "o servidor não respondeu a tempo. Confira o endereço e a internet do computador.";
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(String(code))) return `o certificado HTTPS não foi aceito (${code}). Confira se a data e a hora do computador estão certas.`;
  return `${error.cause?.message ?? error.message}. Confira o endereço e a internet deste computador.`;
}

async function verify({ config }) {
  if (!config.server || !config.token) throw new ExitError("Informe o endereço do sistema e o token da impressora.", 2);
  let url;
  try { url = new URL(config.server); } catch { url = null; }
  if (!url || !/^https?:$/.test(url.protocol)) throw new ExitError(`Endereço inválido: ${config.server}. Use o endereço completo, como https://pdv.sua-loja.com.br.`, 2);
  let response;
  try { response = await request(config, "/api/print/agent/hello", { signal: AbortSignal.timeout(15_000) }); }
  catch (error) { throw new ExitError(`Não consegui falar com ${config.server}: ${networkReason(error)}`, 3); }
  if (response.status === 401) throw new ExitError("O servidor recusou o token. Na tela Impressoras do painel, use Novo token e cole o token novo.", 2);
  if (response.status === 404) throw new ExitError(`${config.server} respondeu, mas não reconheceu o agente. Confira o endereço (é o mesmo do painel do Coliseu PDV).`, 2);
  if (!response.ok) throw new ExitError(`O servidor respondeu HTTP ${response.status}. Tente de novo em instantes.`, 3);
  const body = await response.json().catch(() => ({}));
  return `Token conferido: impressora "${body.terminal ?? "?"}" da loja "${body.store ?? "?"}".`;
}

async function configure({ config, file }) {
  for (const key of ["server", "token", "printer"]) if (!config[key]) throw new ExitError(`Falta "${key}" para gravar ${file}.`, 2);
  await writeFile(file, JSON.stringify(config, null, 2) + os.EOL);
  return `Configuração gravada em ${file}.`;
}

/* Mensagem final: na tela e, para o instalador, num arquivo UTF-16LE (o NSIS lê com FileReadUTF16LE). */
async function result(message) {
  const file = option("--resultado");
  if (file) await writeFile(file, Buffer.from(message.replace(/\s*\r?\n\s*/g, " "), "utf16le")).catch(() => undefined);
}

/* ---------------- Windows: ligar junto com o sistema ---------------- */

const xmlText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Tarefa do Agendador em XML porque o `schtasks /Create` simples para a tarefa depois de 3 dias e não a inicia na
 * bateria. Roda como SYSTEM (S-1-5-18), ao ligar o computador, sem janela, e volta sozinha se o agente cair. */
function taskXml(configFile) {
  const command = process.execPath;
  const commandArgs = `${packaged ? "" : `"${scriptFile}" `}--config "${configFile}"`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Agente de impressão do Coliseu PDV</Description></RegistrationInfo>
  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>${xmlText(command)}</Command><Arguments>${xmlText(commandArgs)}</Arguments><WorkingDirectory>${xmlText(here)}</WorkingDirectory></Exec></Actions>
</Task>
`;
}

async function installWindows(config) {
  if (process.platform !== "win32") throw new Error("--instalar é só para Windows. No Linux, use o serviço do systemd descrito no começo do arquivo.");
  const file = path.join(os.tmpdir(), `coliseu-print-task-${process.pid}.xml`);
  await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskXml(config.file), "utf16le")]));
  try { await run("schtasks.exe", ["/Create", "/TN", TASK_NAME, "/XML", file, "/F"]); }
  catch (error) { throw new Error(`Não consegui criar a tarefa. Abra o Prompt de Comando como administrador e repita. (${error.message})`); }
  finally { await unlink(file).catch(() => undefined); }
  await run("schtasks.exe", ["/Run", "/TN", TASK_NAME]);
  return `Instalado: a tarefa "${TASK_NAME}" liga o agente junto com o Windows e já foi iniciada. Registro em ${path.join(here, "coliseu-print-agent.log")}.`;
}

async function uninstallWindows() {
  if (process.platform !== "win32") throw new Error("--desinstalar é só para Windows.");
  await run("schtasks.exe", ["/End", "/TN", TASK_NAME]).catch(() => undefined);
  try { await run("schtasks.exe", ["/Delete", "/TN", TASK_NAME, "/F"]); }
  catch (error) { throw new Error(`Não consegui remover a tarefa. Abra o Prompt de Comando como administrador e repita. (${error.message})`); }
  log(`Removida a tarefa "${TASK_NAME}". O agente não liga mais com o Windows.`);
}

async function main() {
  if (flag("--version")) { console.log(VERSION); return; }
  if (flag("--list")) { console.log(await listPrinters()); return; }
  if (flag("--desinstalar")) { await uninstallWindows(); return; }
  if (flag("--verificar") || flag("--configurar")) {
    const current = await configFromOptions();
    const message = flag("--verificar") ? await verify(current) : await configure(current);
    await result(message);
    say(message);
    return;
  }
  const logOption = option("--log");
  if (logOption || packaged) openLog(path.resolve(logOption ?? path.join(here, "coliseu-print-agent.log")));
  const config = await loadConfig();
  if (flag("--instalar")) { const message = await installWindows(config); await result(message); log(message); return; }
  if (flag("--test")) {
    await sendToPrinter(config.printer, localTestPage(config));
    const message = `Página de teste enviada para "${config.printer}".`;
    await result(message);
    log(message);
    return;
  }
  await loop(config);
}

/* Aberto com dois cliques, o .exe fecha a janela ao terminar; em caso de erro, espera o Enter para dar tempo de ler. */
const pressEnter = () => new Promise((resolve) => { process.stdout.write("\nPressione Enter para fechar."); process.stdin.once("data", resolve); });

main().then(() => process.exit(0), async (error) => {
  await result(error.message);
  if (logFile) try { appendFileSync(logFile, `${new Date().toISOString()} ERRO ${error.message}${os.EOL}`); } catch { /* ignora */ }
  try { console.error(error.message); } catch { /* sem console */ }
  if (packaged && process.platform === "win32" && process.stdin.isTTY) await pressEnter();
  process.exit(error instanceof ExitError ? error.exitCode : 1);
});
