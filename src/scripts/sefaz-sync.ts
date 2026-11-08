import "dotenv/config";
import { runWithScope } from "@/db/scope";
import { getFiscalIdentityConfig } from "@/modules/fiscal/config";
import { syncSefazDfe } from "@/modules/fiscal/service";
import { fiscalStoreScope } from "@/modules/fiscal/store-scope";

(async()=>{
  const scope=await fiscalStoreScope(getFiscalIdentityConfig().cnpj);
  if(!scope)throw new Error("Não há como saber a loja da integração fiscal: cadastre o CNPJ da loja no painel do sistema ou mantenha uma única loja ativa.");
  const result=await runWithScope(scope,()=>syncSefazDfe());
  console.log(JSON.stringify(result));
  process.exit(0);
})().catch((error)=>{console.error(error instanceof Error?error.message:error);process.exit(1)});
