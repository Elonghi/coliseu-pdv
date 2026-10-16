import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/db";
import { AppError } from "@/lib/errors";
import { distributeDfe, queryDfeByAccessKey } from "./client";
import { getFiscalIdentityConfig, getSefazConfig, type FiscalIdentityConfig, type SefazConfig } from "./config";
import { manifestationLabel, normalizeDfeXml, type NormalizedDfe } from "./xml";
import { cancelFiscalPayable, createPayableFromFiscalInvoice } from "@/modules/finance/service";
import { cancelFiscalInvoiceStock, importFiscalInvoiceToStock } from "./stock";

type SyncState = { id: string; last_nsu: string; max_nsu: string; next_sync_at: Date };
export type SefazSyncResult = { status: "completed" | "deferred" | "running"; documents: number; recovered: number; batches: number; lastNsu?: string; maxNsu?: string; message: string };
type SyncOptions = { config?: SefazConfig; distribute?: typeof distributeDfe; queryByAccessKey?: typeof queryDfeByAccessKey };

async function ensureSyncState(client: PoolClient, config: FiscalIdentityConfig) {
  return (await client.query<SyncState>(`INSERT INTO sefaz_sync_states (company_cnpj,environment,uf_code)
    VALUES ($1,$2,$3) ON CONFLICT (company_cnpj,environment) DO UPDATE SET uf_code=excluded.uf_code,updated_at=now()
    RETURNING id,last_nsu,max_nsu,next_sync_at`, [config.cnpj, config.environment, config.ufCode])).rows[0];
}

async function persistInvoice(client: PoolClient, stateId: string, sourceDocumentId: string, normalized: NormalizedDfe, companyCnpj: string, actorId?: string) {
  const invoice = normalized.invoice;
  if (!invoice) return null;
  const result = await client.query<{ id: string }>(`INSERT INTO fiscal_invoices
    (sync_state_id,source_document_id,access_key,has_full_xml,status,issuer_cnpj_cpf,issuer_name,issuer_state_registration,recipient_cnpj_cpf,recipient_name,recipient_state_registration,issue_at,authorization_at,operation_type,model,series,number,operation_nature,total_cents,protocol,xml_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    ON CONFLICT (sync_state_id,access_key) DO UPDATE SET
      source_document_id=CASE WHEN excluded.has_full_xml OR NOT fiscal_invoices.has_full_xml THEN excluded.source_document_id ELSE fiscal_invoices.source_document_id END,
      has_full_xml=fiscal_invoices.has_full_xml OR excluded.has_full_xml,
      status=CASE WHEN excluded.status='UNKNOWN' THEN fiscal_invoices.status ELSE excluded.status END,
      issuer_cnpj_cpf=COALESCE(excluded.issuer_cnpj_cpf,fiscal_invoices.issuer_cnpj_cpf),issuer_name=COALESCE(excluded.issuer_name,fiscal_invoices.issuer_name),issuer_state_registration=COALESCE(excluded.issuer_state_registration,fiscal_invoices.issuer_state_registration),
      recipient_cnpj_cpf=COALESCE(excluded.recipient_cnpj_cpf,fiscal_invoices.recipient_cnpj_cpf),recipient_name=COALESCE(excluded.recipient_name,fiscal_invoices.recipient_name),recipient_state_registration=COALESCE(excluded.recipient_state_registration,fiscal_invoices.recipient_state_registration),
      issue_at=COALESCE(excluded.issue_at,fiscal_invoices.issue_at),authorization_at=COALESCE(excluded.authorization_at,fiscal_invoices.authorization_at),operation_type=COALESCE(excluded.operation_type,fiscal_invoices.operation_type),
      model=COALESCE(excluded.model,fiscal_invoices.model),series=COALESCE(excluded.series,fiscal_invoices.series),number=COALESCE(excluded.number,fiscal_invoices.number),operation_nature=COALESCE(excluded.operation_nature,fiscal_invoices.operation_nature),
      total_cents=COALESCE(excluded.total_cents,fiscal_invoices.total_cents),protocol=COALESCE(excluded.protocol,fiscal_invoices.protocol),xml_version=COALESCE(excluded.xml_version,fiscal_invoices.xml_version),updated_at=now()
    RETURNING id`, [stateId, sourceDocumentId, invoice.accessKey, invoice.hasFullXml, invoice.status, invoice.issuerCnpjCpf ?? null, invoice.issuerName ?? null, invoice.issuerStateRegistration ?? null, invoice.recipientCnpjCpf ?? null, invoice.recipientName ?? null, invoice.recipientStateRegistration ?? null, invoice.issueAt ?? null, invoice.authorizationAt ?? null, invoice.operationType ?? null, invoice.model ?? null, invoice.series ?? null, invoice.number ?? null, invoice.operationNature ?? null, invoice.totalCents ?? null, invoice.protocol ?? null, invoice.xmlVersion ?? null]);
  const invoiceId = result.rows[0].id;
  if (invoice.hasFullXml) {
    for (const item of normalized.items) {
      await client.query(`INSERT INTO fiscal_invoice_items (invoice_id,item_number,product_code,ean,description,ncm,cfop,unit,quantity,unit_value_cents,total_cents,discount_cents,freight_cents,insurance_cents,other_cents,taxes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (invoice_id,item_number) DO UPDATE SET product_code=excluded.product_code,ean=excluded.ean,description=excluded.description,ncm=excluded.ncm,cfop=excluded.cfop,unit=excluded.unit,quantity=excluded.quantity,unit_value_cents=excluded.unit_value_cents,total_cents=excluded.total_cents,discount_cents=excluded.discount_cents,freight_cents=excluded.freight_cents,insurance_cents=excluded.insurance_cents,other_cents=excluded.other_cents,taxes=excluded.taxes`, [invoiceId, item.itemNumber, item.productCode ?? null, item.ean ?? null, item.description, item.ncm ?? null, item.cfop ?? null, item.unit ?? null, item.quantity ?? null, item.unitValueCents ?? null, item.totalCents ?? null, item.discountCents ?? null, item.freightCents ?? null, item.insuranceCents ?? null, item.otherCents ?? null, item.taxes ? JSON.stringify(item.taxes) : null]);
    }
  }
  await client.query("UPDATE fiscal_invoice_events SET invoice_id=$1 WHERE access_key=$2 AND invoice_id IS NULL", [invoiceId, invoice.accessKey]);
  await client.query(`UPDATE fiscal_invoices SET status='CANCELED',updated_at=now() WHERE id=$1 AND EXISTS (
    SELECT 1 FROM fiscal_invoice_events e WHERE e.invoice_id=$1 AND e.event_type='110111' AND e.protocol IS NOT NULL AND (e.status_code IS NULL OR e.status_code IN ('135','136','155'))
  )`, [invoiceId]);
  const manifestation = await client.query<{ event_type: string }>(`SELECT event_type FROM fiscal_invoice_events
    WHERE invoice_id=$1 AND event_type IN ('210200','210210','210220','210240') AND protocol IS NOT NULL AND (status_code IS NULL OR status_code IN ('135','136','155'))
    ORDER BY event_at DESC NULLS LAST,created_at DESC LIMIT 1`, [invoiceId]);
  const manifestationStatus = manifestationLabel(manifestation.rows[0]?.event_type);
  if (manifestationStatus) await client.query("UPDATE fiscal_invoices SET manifestation_status=$1,updated_at=now() WHERE id=$2", [manifestationStatus, invoiceId]);
  const current = await client.query<{ status: string }>("SELECT status FROM fiscal_invoices WHERE id=$1", [invoiceId]);
  if (current.rows[0]?.status === "CANCELED") {
    await cancelFiscalPayable(client, invoiceId);
    await cancelFiscalInvoiceStock(client, invoiceId, actorId);
  } else if (invoice.hasFullXml && current.rows[0]?.status === "AUTHORIZED" && normalizeDocument(invoice.recipientCnpjCpf) === normalizeDocument(companyCnpj)) {
    await importFiscalInvoiceToStock(client, { invoiceId, actorId, accessKey: invoice.accessKey, number: invoice.number, issuerName: invoice.issuerName, issuerDocument: invoice.issuerCnpjCpf });
    if (normalized.billing?.duplicates.length) {
      await createPayableFromFiscalInvoice(client, {
        fiscalInvoiceId: invoiceId,
        actorId,
        accessKey: invoice.accessKey,
        number: invoice.number,
        series: invoice.series,
        issuerName: invoice.issuerName,
        issuerDocument: invoice.issuerCnpjCpf,
        issueAt: invoice.issueAt,
        billingNumber: normalized.billing.invoiceNumber,
        duplicates: normalized.billing.duplicates,
      });
    }
  }
  return invoiceId;
}

async function persistEvent(client: PoolClient, stateId: string, sourceDocumentId: string, normalized: NormalizedDfe, actorId?: string) {
  const event = normalized.event;
  if (!event) return;
  const invoice = event.accessKey ? await client.query<{ id: string }>("SELECT id FROM fiscal_invoices WHERE sync_state_id=$1 AND access_key=$2 LIMIT 1", [stateId, event.accessKey]) : null;
  const invoiceId = invoice?.rows[0]?.id ?? null;
  await client.query(`INSERT INTO fiscal_invoice_events (source_document_id,invoice_id,access_key,event_type,sequence,event_at,protocol,status_code,status_message)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (source_document_id) DO UPDATE SET invoice_id=COALESCE(excluded.invoice_id,fiscal_invoice_events.invoice_id),status_code=excluded.status_code,status_message=excluded.status_message`, [sourceDocumentId, invoiceId, event.accessKey ?? null, event.eventType ?? null, event.sequence ?? null, event.eventAt ?? null, event.protocol ?? null, event.statusCode ?? null, event.statusMessage ?? null]);
  const accepted = Boolean(event.protocol) && (!event.statusCode || ["135", "136", "155"].includes(event.statusCode));
  if (!invoiceId || !accepted) return;
  if (event.eventType === "110111") {
    await client.query("UPDATE fiscal_invoices SET status='CANCELED',updated_at=now() WHERE id=$1", [invoiceId]);
    await cancelFiscalPayable(client, invoiceId);
    await cancelFiscalInvoiceStock(client, invoiceId, actorId);
  }
  const manifestation = manifestationLabel(event.eventType);
  if (manifestation) await client.query("UPDATE fiscal_invoices SET manifestation_status=$1,updated_at=now() WHERE id=$2", [manifestation, invoiceId]);
}

async function persistDocument(client: PoolClient, stateId: string, document: { nsu: string; schema: string; xml: string }, companyCnpj: string, actorId?: string) {
  const normalized = normalizeDfeXml(document.xml);
  const source = await client.query<{ id: string }>(`INSERT INTO fiscal_dfe_documents (sync_state_id,nsu,schema,kind,access_key,raw_xml,parsed)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sync_state_id,nsu) DO UPDATE SET schema=excluded.schema,kind=excluded.kind,access_key=excluded.access_key,raw_xml=excluded.raw_xml,parsed=excluded.parsed,received_at=now()
    RETURNING id`, [stateId, document.nsu, document.schema, normalized.kind, normalized.accessKey ?? null, document.xml, JSON.stringify(normalized.parsed)]);
  await persistInvoice(client, stateId, source.rows[0].id, normalized, companyCnpj, actorId);
  await persistEvent(client, stateId, source.rows[0].id, normalized, actorId);
}

async function recoverSummaryXmls(
  client: PoolClient,
  stateId: string,
  config: SefazConfig,
  actorId: string | undefined,
  queryByAccessKey: typeof queryDfeByAccessKey,
) {
  const candidates = await client.query<{ id: string; access_key: string }>(`SELECT id,access_key FROM fiscal_invoices
    WHERE sync_state_id=$1 AND has_full_xml=false
      AND (issue_at IS NULL OR issue_at >= now()-interval '90 days')
    ORDER BY issue_at DESC NULLS LAST,created_at DESC LIMIT 20`, [stateId]);
  let recovered = 0;
  let documents = 0;
  for (const candidate of candidates.rows) {
    const response = await queryByAccessKey(config, candidate.access_key);
    if (response.statusCode === "656") throw new AppError(`SEFAZ 656: ${response.statusMessage}`, 502, "SEFAZ_656");
    if (response.statusCode === "137") continue;
    if (response.statusCode !== "138") throw new AppError(`SEFAZ ${response.statusCode}: ${response.statusMessage}`, 502, `SEFAZ_${response.statusCode}`);
    await client.query("BEGIN");
    try {
      for (const document of response.documents) await persistDocument(client, stateId, document, config.cnpj, actorId);
      documents += response.documents.length;
      const current = await client.query<{ has_full_xml: boolean }>("SELECT has_full_xml FROM fiscal_invoices WHERE id=$1", [candidate.id]);
      if (current.rows[0]?.has_full_xml) recovered++;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  return { recovered, documents, attempted: candidates.rowCount ?? 0 };
}

export type FiscalXmlImportResult = {
  fileName: string;
  status: "IMPORTED" | "DUPLICATE" | "FAILED";
  accessKey?: string;
  message: string;
};

export type FiscalXmlImportBatchResult = {
  batchId: string;
  fileCount: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  results: FiscalXmlImportResult[];
};

const normalizeDocument = (value?: string) => value?.toUpperCase().replace(/[^A-Z0-9]/g, "");
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível importar o XML.";

export async function importFiscalXmlBatch(
  files: { name: string; xml: string }[],
  actorId?: string,
  identity: FiscalIdentityConfig = getFiscalIdentityConfig(),
): Promise<FiscalXmlImportBatchResult> {
  if (!files.length || files.length > 100) throw new AppError("Selecione de 1 a 100 arquivos XML.", 422, "FISCAL_IMPORT_FILE_COUNT");
  const client = await pool.connect();
  try {
    const state = await ensureSyncState(client, identity);
    const batch = await client.query<{ id: string }>(`INSERT INTO fiscal_import_batches (sync_state_id,imported_by_id,file_count)
      VALUES ($1,$2,$3) RETURNING id`, [state.id, actorId ?? null, files.length]);
    const batchId = batch.rows[0].id;
    const results: FiscalXmlImportResult[] = [];

    for (const file of files) {
      const fileName = (file.name.trim() || "nota.xml").slice(0, 255);
      let transactionOpen = false;
      try {
        const xml = file.xml.replace(/^\uFEFF/, "").trim();
        if (!xml) throw new AppError("O arquivo está vazio.", 422, "FISCAL_IMPORT_EMPTY");
        const normalized = normalizeDfeXml(xml);
        if (normalized.kind !== "NFE" || !normalized.invoice?.hasFullXml) throw new AppError("O arquivo não contém uma NF-e completa (NFe/nfeProc).", 422, "FISCAL_IMPORT_NOT_NFE");
        const invoice = normalized.invoice;
        if (!/^\d{44}$/.test(invoice.accessKey)) throw new AppError("A chave de acesso da NF-e é inválida.", 422, "FISCAL_IMPORT_ACCESS_KEY");
        const parties = [normalizeDocument(invoice.issuerCnpjCpf), normalizeDocument(invoice.recipientCnpjCpf)];
        if (!parties.includes(identity.cnpj)) throw new AppError("A NF-e não pertence ao CNPJ configurado no sistema.", 422, "FISCAL_IMPORT_CNPJ");
        const contentHash = createHash("sha256").update(xml).digest("hex");

        await client.query("BEGIN");
        transactionOpen = true;
        const existing = await client.query<{ has_full_xml: boolean; source_document_id: string | null }>("SELECT has_full_xml,source_document_id FROM fiscal_invoices WHERE sync_state_id=$1 AND access_key=$2 FOR UPDATE", [state.id, invoice.accessKey]);
        if (existing.rows[0]?.has_full_xml) {
          if (existing.rows[0].source_document_id) await persistInvoice(client, state.id, existing.rows[0].source_document_id, normalized, identity.cnpj, actorId);
          await client.query("COMMIT");
          transactionOpen = false;
          results.push({ fileName, status: "DUPLICATE", accessKey: invoice.accessKey, message: "NF-e já cadastrada; duplicatas financeiras verificadas." });
          continue;
        }
        const source = await client.query<{ id: string }>(`INSERT INTO fiscal_dfe_documents
          (sync_state_id,import_batch_id,nsu,schema,kind,access_key,original_file_name,content_hash,raw_xml,parsed)
          VALUES ($1,$2,NULL,$3,'NFE',$4,$5,$6,$7,$8) RETURNING id`, [state.id, batchId, `procNFe_v${invoice.xmlVersion ?? "4.00"}.xsd`, invoice.accessKey, fileName, contentHash, xml, JSON.stringify(normalized.parsed)]);
        await persistInvoice(client, state.id, source.rows[0].id, normalized, identity.cnpj, actorId);
        await client.query("COMMIT");
        transactionOpen = false;
        results.push({ fileName, status: "IMPORTED", accessKey: invoice.accessKey, message: "NF-e importada com sucesso." });
      } catch (error) {
        if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
        const databaseError = error as { code?: string; constraint?: string };
        if (databaseError.code === "23505" && databaseError.constraint === "fiscal_dfe_documents_state_hash_uidx") {
          results.push({ fileName, status: "DUPLICATE", message: "Este arquivo XML já havia sido importado." });
        } else {
          results.push({ fileName, status: "FAILED", message: errorMessage(error).slice(0, 500) });
        }
      }
    }

    const importedCount = results.filter((result) => result.status === "IMPORTED").length;
    const duplicateCount = results.filter((result) => result.status === "DUPLICATE").length;
    const failedCount = results.filter((result) => result.status === "FAILED").length;
    await client.query(`UPDATE fiscal_import_batches SET imported_count=$1,duplicate_count=$2,failed_count=$3,results=$4,completed_at=now() WHERE id=$5`,
      [importedCount, duplicateCount, failedCount, JSON.stringify(results), batchId]);
    if (actorId) await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'FISCAL_XML_IMPORT','fiscal_import_batch',$2,$3)", [actorId, batchId, JSON.stringify({ fileCount: files.length, importedCount, duplicateCount, failedCount })]);
    return { batchId, fileCount: files.length, importedCount, duplicateCount, failedCount, results };
  } finally {
    client.release();
  }
}

async function saveFailure(client: PoolClient, stateId: string | undefined, error: unknown) {
  if (!stateId) return;
  const message = error instanceof Error ? error.message : "Erro desconhecido durante sincronização.";
  const delay = error instanceof AppError && error.code === "SEFAZ_656" ? "65 minutes" : "15 minutes";
  await client.query("UPDATE sefaz_sync_states SET last_error=$1,last_synced_at=now(),next_sync_at=now()+$2::interval,updated_at=now() WHERE id=$3", [message.slice(0, 4000), delay, stateId]);
}

export async function syncSefazDfe(actorId?: string, options: SyncOptions = {}): Promise<SefazSyncResult> {
  const config = options.config ?? getSefazConfig();
  const distribution = options.distribute ?? distributeDfe;
  if (!config.enabled) throw new AppError("A integração SEFAZ está desativada.", 503, "SEFAZ_DISABLED");
  const client = await pool.connect();
  let locked = false;
  let state: SyncState | undefined;
  const lockKey = `sefaz-dfe:${config.environment}:${config.cnpj}`;
  try {
    locked = (await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) acquired", [lockKey])).rows[0].acquired;
    if (!locked) return { status: "running", documents: 0, recovered: 0, batches: 0, message: "Já existe uma sincronização em andamento." };
    state = await ensureSyncState(client, config);
    if (state.next_sync_at > new Date()) return { status: "deferred", documents: 0, recovered: 0, batches: 0, lastNsu: state.last_nsu, maxNsu: state.max_nsu, message: `Próxima consulta permitida após ${state.next_sync_at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` };
    let lastNsu = state.last_nsu;
    let maxNsu = state.max_nsu;
    let documents = 0;
    let batches = 0;
    let lastMessage = "";
    while (batches < config.maxBatches) {
      const response = await distribution(config, lastNsu);
      batches++;
      lastMessage = response.statusMessage;
      if (!["137", "138"].includes(response.statusCode)) {
        const delay = response.statusCode === "656" ? "65 minutes" : "15 minutes";
        await client.query(`UPDATE sefaz_sync_states SET
          last_nsu=CASE WHEN $1='656' AND $5::text <> '000000000000000' THEN $5 ELSE last_nsu END,
          max_nsu=CASE WHEN $1='656' AND $6::text <> '000000000000000' THEN $6 ELSE max_nsu END,
          last_status_code=$1,last_status_message=$2,last_error=$2,last_synced_at=now(),next_sync_at=now()+$3::interval,updated_at=now()
          WHERE id=$4`, [response.statusCode, response.statusMessage, delay, state.id, response.lastNsu, response.maxNsu]);
        throw new AppError(`SEFAZ ${response.statusCode}: ${response.statusMessage}`, 502, `SEFAZ_${response.statusCode}`);
      }
      await client.query("BEGIN");
      try {
        for (const document of response.documents) await persistDocument(client, state.id, document, config.cnpj, actorId);
        lastNsu = response.lastNsu;
        maxNsu = response.maxNsu;
        documents += response.documents.length;
        const completed = BigInt(lastNsu) >= BigInt(maxNsu) || response.statusCode === "137";
        await client.query(`UPDATE sefaz_sync_states SET last_nsu=$1,max_nsu=$2,last_status_code=$3,last_status_message=$4,last_error=NULL,last_synced_at=now(),
          next_sync_at=CASE WHEN $5 THEN now()+GREATEST($6,60)::int*interval '1 minute' ELSE now() END,updated_at=now() WHERE id=$7`, [lastNsu, maxNsu, response.statusCode, response.statusMessage, completed, config.intervalMinutes, state.id]);
        await client.query("COMMIT");
        if (completed) break;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    const recovery = await recoverSummaryXmls(client, state.id, config, actorId, options.queryByAccessKey ?? queryDfeByAccessKey);
    documents += recovery.documents;
    if (actorId) await client.query("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,after) VALUES ($1,'SEFAZ_SYNC','sefaz_sync_state',$2,$3)", [actorId, state.id, JSON.stringify({ documents, recovered: recovery.recovered, recoveryAttempts: recovery.attempted, batches, lastNsu, maxNsu })]);
    const recoveryMessage = recovery.recovered ? ` ${recovery.recovered} resumo(s) atualizado(s) com o XML completo.` : "";
    return { status: "completed", documents, recovered: recovery.recovered, batches, lastNsu, maxNsu, message: `${lastMessage || "Sincronização concluída."}${recoveryMessage}` };
  } catch (error) {
    await saveFailure(client, state?.id, error);
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lockKey]).catch(() => undefined);
    client.release();
  }
}
