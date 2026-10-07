import { cpSync, existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root=process.cwd();
const standalone=path.join(root,".next","standalone");
if(!existsSync(path.join(standalone,"server.js"))) throw new Error("Execute npm run build antes de npm start.");
mkdirSync(path.join(standalone,".next"),{recursive:true});
cpSync(path.join(root,".next","static"),path.join(standalone,".next","static"),{recursive:true});
if(existsSync(path.join(root,"public")))cpSync(path.join(root,"public"),path.join(standalone,"public"),{recursive:true});
await import(pathToFileURL(path.join(standalone,"server.js")).href);
