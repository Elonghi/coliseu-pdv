"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { FiscalXmlImportBatchResult } from "@/modules/fiscal/service";

export function FiscalImportForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<FiscalXmlImportBatchResult>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true); setError(undefined); setResult(undefined);
    try {
      const response = await fetch("/api/fiscal/import", { method: "POST", body: new FormData(form) });
      const data = await response.json() as FiscalXmlImportBatchResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível importar os XMLs.");
      setResult(data); form.reset(); router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível importar os XMLs.");
    } finally {
      setPending(false);
    }
  }

  return <section className="card p-5 grid gap-4">
    <div><p className="text-sm text-gray-500 font-bold">IMPORTAÇÃO RETROATIVA</p><h2 className="font-black text-xl">Importar notas por XML</h2><p className="text-sm text-gray-500">Selecione até 100 XMLs de NF-e completa por lote. Limite de 5 MB por arquivo e 50 MB por lote.</p></div>
    <form onSubmit={submit} className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
      <label className="label">Arquivos XML<input className="field" type="file" name="files" accept=".xml,application/xml,text/xml" multiple required disabled={pending}/></label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Importando..." : "Importar XMLs"}</button>
    </form>
    {error&&<p className="notice-error">{error}</p>}
    {result&&<div className="grid gap-3"><p className={result.failedCount?"notice-error":"notice-ok"}>{result.importedCount} importada(s), {result.duplicateCount} duplicada(s) e {result.failedCount} com erro.</p>
      <div className="table-wrap max-h-80"><table><thead><tr><th>Arquivo</th><th>Resultado</th><th>Mensagem</th></tr></thead><tbody>{result.results.map((item,index)=><tr key={`${item.fileName}-${index}`}><td className="font-bold">{item.fileName}<small className="block text-gray-500 font-mono">{item.accessKey}</small></td><td><span className={`badge ${item.status==="IMPORTED"?"badge-ok":item.status==="DUPLICATE"?"badge-warn":"badge-danger"}`}>{item.status==="IMPORTED"?"Importada":item.status==="DUPLICATE"?"Duplicada":"Erro"}</span></td><td>{item.message}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
