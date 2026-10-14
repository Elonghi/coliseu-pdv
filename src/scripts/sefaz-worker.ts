import "dotenv/config";
import { isSefazEnabled } from "@/modules/fiscal/config";
import { syncSefazDfe } from "@/modules/fiscal/service";

let running=true;
process.on("SIGTERM",()=>{running=false});
process.on("SIGINT",()=>{running=false});
const wait=(milliseconds:number)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));

console.log("Worker de distribuição DF-e iniciado.");
while(running){
  if(isSefazEnabled()){
    try{const result=await syncSefazDfe();console.log(`[SEFAZ] ${new Date().toISOString()} ${result.status}: ${result.message} (${result.documents} documento(s))`)}
    catch(error){console.error(`[SEFAZ] ${new Date().toISOString()} ${error instanceof Error?error.message:error}`)}
  }
  for(let elapsed=0;running&&elapsed<60;elapsed++)await wait(1_000);
}
console.log("Worker de distribuição DF-e encerrado.");
