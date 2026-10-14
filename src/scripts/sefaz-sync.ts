import "dotenv/config";
import { syncSefazDfe } from "@/modules/fiscal/service";

syncSefazDfe().then((result)=>{console.log(JSON.stringify(result));process.exit(0)}).catch((error)=>{console.error(error instanceof Error?error.message:error);process.exit(1)});
