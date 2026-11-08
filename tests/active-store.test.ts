import { describe, expect, it } from "vitest";
import { readableError } from "@/lib/validation-message";
import { resolveActiveStore, scopeFor } from "@/modules/auth/stores";

const centro = { id: "c1", name: "Centro" };
const shopping = { id: "s1", name: "Shopping" };

describe("loja ativa", () => {
  it("sem nenhuma loja, não há loja ativa", () => {
    expect(resolveActiveStore([], "c1")).toEqual({ storeId: null, consolidated: false });
  });

  it("com uma loja só, é sempre ela, ignorando o que veio no cookie", () => {
    expect(resolveActiveStore([centro])).toEqual({ storeId: "c1", consolidated: false });
    expect(resolveActiveStore([centro], "all")).toEqual({ storeId: "c1", consolidated: false });
    expect(resolveActiveStore([centro], "outra")).toEqual({ storeId: "c1", consolidated: false });
  });

  it("com várias lojas, vale a escolhida se for do usuário", () => {
    expect(resolveActiveStore([centro, shopping], "s1")).toEqual({ storeId: "s1", consolidated: false });
  });

  it("com várias lojas e sem escolha válida, é a visão de todas as lojas", () => {
    expect(resolveActiveStore([centro, shopping])).toEqual({ storeId: null, consolidated: true });
    expect(resolveActiveStore([centro, shopping], "all")).toEqual({ storeId: null, consolidated: true });
    expect(resolveActiveStore([centro, shopping], "loja-de-outro-lojista")).toEqual({ storeId: null, consolidated: true });
  });

  it("o escopo de dados leva só a loja ativa, ou todas as lojas do usuário na visão consolidada", () => {
    expect(scopeFor("conta", [centro, shopping], "s1")).toEqual({ accountId: "conta", storeId: "s1", storeIds: ["s1"] });
    expect(scopeFor("conta", [centro, shopping])).toEqual({ accountId: "conta", storeId: null, storeIds: ["c1", "s1"] });
    expect(scopeFor(null, [])).toEqual({ accountId: null, storeId: null, storeIds: [] });
  });

  it("o erro de gravar sem loja ativa vira uma orientação", () => {
    expect(readableError('null value in column "store_id" of relation "sales" violates not-null constraint')).toMatch(/Escolha uma loja específica/);
    expect(readableError('new row violates row-level security policy for table "cash_registers"')).toMatch(/Escolha uma loja específica/);
    expect(readableError("outro erro qualquer")).toBe("outro erro qualquer");
  });
});
