import { describe, expect, it } from "vitest";
import { requireSameOrigin, shouldUseSecureSessionCookie } from "@/lib/security";

describe("proteção de origem das APIs mutáveis",()=>{
  it("aceita mesma origem e rejeita origem diferente",()=>{
    expect(()=>requireSameOrigin(new Request("http://localhost/api/sales",{headers:{host:"localhost",origin:"http://localhost"}}))).not.toThrow();
    expect(()=>requireSameOrigin(new Request("http://localhost/api/sales",{headers:{host:"localhost",origin:"https://evil.example"}}))).toThrow(/Origem/);
  });

  it("mantém cookies seguros por padrão em produção e permite HTTP explicitamente",()=>{
    expect(shouldUseSecureSessionCookie("production",undefined)).toBe(true);
    expect(shouldUseSecureSessionCookie("production","false")).toBe(false);
    expect(shouldUseSecureSessionCookie("development", "true")).toBe(true);
  });
});
