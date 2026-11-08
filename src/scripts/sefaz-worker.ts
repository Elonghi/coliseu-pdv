import "dotenv/config";
import { runWithScope } from "@/db/scope";
import { getFiscalIdentityConfig, isSefazEnabled } from "@/modules/fiscal/config";
import { syncSefazDfe } from "@/modules/fiscal/service";
import { fiscalStoreScope } from "@/modules/fiscal/store-scope";

let running=true;
process.on("SIGTERM",()=>{running=false});
process.on("SIGINT",()=>{running=false});
const wait=(milliseconds:number)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));

console.log("Worker de distribuição DF-e iniciado.");
let warnedAt=0;
while(running){
  if(isSefazEnabled()){
    try{
      const scope=await fiscalStoreScope(getFiscalIdentityConfig().cnpj);
      if(!scope){
        if(Date.now()-warnedAt>600_000){warnedAt=Date.now();console.error(`[SEFAZ] ${new Date().toISOString()} Não há como saber a loja da integração fiscal: cadastre o CNPJ da loja no painel do sistema ou mantenha uma única loja ativa.`)}
      }else{
        const result=await runWithScope(scope,()=>syncSefazDfe());
        console.log(`[SEFAZ] ${new Date().toISOString()} ${result.status}: ${result.message} (${result.documents} documento(s))`);
      }
    }
    catch(error){console.error(`[SEFAZ] ${new Date().toISOString()} ${error instanceof Error?error.message:error}`)}
  }
  for(let elapsed=0;running&&elapsed<60;elapsed++)await wait(1_000);
}
console.log("Worker de distribuição DF-e encerrado.");
