import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDistributionEnvelope, parseDistributionResponse } from "@/modules/fiscal/client";
import { decimalToCents, normalizeDfeXml } from "@/modules/fiscal/xml";
import { accessKey, eventSummaryXml, fullXml, summaryXml } from "./fixtures/fiscal";

describe("conversão de documentos fiscais brasileiros",()=>{
  it("preserva centavos sem usar ponto flutuante",()=>{expect(decimalToCents("1234.565")).toBe(123457)});
  it("normaliza resumo de NF-e",()=>{const result=normalizeDfeXml(summaryXml);expect(result.kind).toBe("SUMMARY");expect(result.invoice).toMatchObject({accessKey,totalCents:123456,issuerName:"Distribuidora Coliseu",status:"AUTHORIZED",hasFullXml:false})});
  it("normaliza NF-e completa e seus itens",()=>{const result=normalizeDfeXml(fullXml);expect(result.kind).toBe("NFE");expect(result.invoice).toMatchObject({number:"123",series:"1",model:"55",totalCents:123456,hasFullXml:true});expect(result.items[0]).toMatchObject({description:"Display de boosters Magic",quantity:"2.0000",unitValueCents:61728,totalCents:123456})});
  it("normaliza resumo de evento fiscal",()=>{const result=normalizeDfeXml(eventSummaryXml);expect(result.kind).toBe("EVENT");expect(result.event).toMatchObject({accessKey,eventType:"110111",sequence:1,protocol:"135260000000002",statusMessage:"Cancelamento registrado"})});
  it("monta o pedido distNSU e descompacta a resposta SOAP",()=>{const envelope=buildDistributionEnvelope({environment:"HOMOLOGATION",ufCode:35,cnpj:"98765432000199"},"42");expect(envelope).toContain("<tpAmb>2</tpAmb>");expect(envelope).toContain("<ultNSU>000000000000042</ultNSU>");const zip=gzipSync(summaryXml).toString("base64");const response=`<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse><nfeDistDFeInteresseResult><retDistDFeInt versao="1.01"><tpAmb>2</tpAmb><verAplic>1</verAplic><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><dhResp>2026-10-14T11:00:00-03:00</dhResp><ultNSU>000000000000043</ultNSU><maxNSU>000000000000043</maxNSU><loteDistDFeInt><docZip NSU="000000000000043" schema="resNFe_v1.01.xsd">${zip}</docZip></loteDistDFeInt></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;const parsed=parseDistributionResponse(response);expect(parsed.documents[0]).toEqual({nsu:"000000000000043",schema:"resNFe_v1.01.xsd",xml:summaryXml});expect(parsed.lastNsu).toBe("000000000000043")});
});
