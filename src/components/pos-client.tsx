"use client";
/* Product images are authenticated route assets; bypassing next/image avoids unauthenticated optimizer fetches. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { calculateDiscount, formatMoney } from "@/lib/money";

type Product={id:string;sku:string;barcode:string|null;name:string;imageKey:string|null;salePriceCents:number;maxDiscountBps:number;stockQuantity:number;unitCode:string};
type CartItem=Product&{quantity:number;discountBasisPoints:number};
type Method={code:string;name:string};
type Player={id:string;name:string;email:string|null;phone:string|null;creditBalanceCents:number};
const moneyInput=(value:string)=>Math.round((Number(value.replace(",","."))||0)*100);
const localDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export function PosClient({methods,userName,isAdmin}:{methods:Method[];userName:string;isAdmin:boolean}){
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Product[]>([]);
  const [cart,setCart]=useState<CartItem[]>([]);
  const [loading,setLoading]=useState(false);
  const [checkout,setCheckoutState]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState<{number:string;totalCents:number}|null>(null);
  const [paymentValues,setPaymentValues]=useState<Record<string,string>>({});
  const [cashReceived,setCashReceived]=useState("");
  const [playerQuery,setPlayerQuery]=useState("");
  const [playerResults,setPlayerResults]=useState<Player[]>([]);
  const [selectedPlayer,setSelectedPlayer]=useState<Player|null>(null);
  const [futureDueDate,setFutureDueDate]=useState(localDate());
  const [ready,setReady]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const hydrated=useRef(false);

  useEffect(()=>{queueMicrotask(()=>{try{const value=localStorage.getItem("coliseu-cart");if(value)setCart(JSON.parse(value))}catch{}finally{hydrated.current=true;setReady(true)}})},[]);
  useEffect(()=>{if(hydrated.current)localStorage.setItem("coliseu-cart",JSON.stringify(cart))},[cart]);
  useEffect(()=>{const timer=setTimeout(async()=>{if(!query.trim()){setResults([]);return}const response=await fetch(`/api/pos/products?q=${encodeURIComponent(query)}`);if(response.ok)setResults(await response.json())},250);return()=>clearTimeout(timer)},[query]);
  useEffect(()=>{let active=true;const timer=setTimeout(async()=>{if(playerQuery.trim().length<2){setPlayerResults([]);return}const response=await fetch(`/api/pos/players?q=${encodeURIComponent(playerQuery)}`);if(response.ok&&active)setPlayerResults(await response.json())},250);return()=>{active=false;clearTimeout(timer)}},[playerQuery]);

  const add=useCallback((product:Product)=>{setCart(old=>{const found=old.find(i=>i.id===product.id);if(found){if(found.quantity>=product.stockQuantity)return old;return old.map(i=>i.id===product.id?{...i,quantity:i.quantity+1}:i)}return[...old,{...product,quantity:1,discountBasisPoints:0}]});setQuery("");setResults([]);inputRef.current?.focus()},[]);
  const subtotal=useMemo(()=>cart.reduce((sum,item)=>sum+item.salePriceCents*item.quantity,0),[cart]);
  const discount=useMemo(()=>cart.reduce((sum,item)=>sum+calculateDiscount(item.salePriceCents*item.quantity,item.discountBasisPoints),0),[cart]);
  const total=subtotal-discount;
  const needsPlayer=moneyInput(paymentValues.PLAYER_CREDIT??"")>0||moneyInput(paymentValues.FUTURE??"")>0;
  const usesFuture=moneyInput(paymentValues.FUTURE??"")>0;

  const openCheckout=useCallback(()=>{if(!cart.length||!methods.length)return;const preferred=methods.find(m=>m.code==="PIX")??methods[0];setError("");setPaymentValues({[preferred.code]:(total/100).toFixed(2)});setSelectedPlayer(null);setPlayerQuery("");setFutureDueDate(localDate());setCheckoutState(true)},[cart.length,methods,total]);
  function setCheckout(value:boolean){if(value)openCheckout();else setCheckoutState(false)}
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==="F2"){event.preventDefault();inputRef.current?.focus()}if(event.key==="F4"){event.preventDefault();openCheckout()}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[openCheckout]);
  function quantity(id:string,delta:number){setCart(old=>old.map(item=>item.id===id?{...item,quantity:Math.max(1,Math.min(item.stockQuantity,item.quantity+delta))}:item))}
  function changeDiscount(id:string,value:number){setCart(old=>old.map(item=>item.id===id?{...item,discountBasisPoints:Math.min(item.maxDiscountBps,Math.max(0,Math.round(value*100)))}:item))}

  async function finish(){
    setError("");
    if(needsPlayer&&!selectedPlayer){setError("Selecione o jogador para crédito ou pagamento futuro.");return}
    if(usesFuture&&!futureDueDate){setError("Informe o vencimento do pagamento futuro.");return}
    const payments=methods.map(method=>{const special=["PLAYER_CREDIT","FUTURE"].includes(method.code);return {methodCode:method.code,amountAppliedCents:moneyInput(paymentValues[method.code]??""),amountReceivedCents:method.code==="CASH"&&paymentValues[method.code]?moneyInput(cashReceived):undefined,playerId:special?selectedPlayer?.id:undefined,dueDate:method.code==="FUTURE"?futureDueDate:undefined}}).filter(payment=>payment.amountAppliedCents>0);
    if(payments.reduce((sum,payment)=>sum+payment.amountAppliedCents,0)!==total){setError("A soma dos pagamentos deve ser igual ao total.");return}
    setLoading(true);
    try{const response=await fetch("/api/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:cart.map(item=>({productId:item.id,quantity:item.quantity,discountBasisPoints:item.discountBasisPoints})),payments})});const body=await response.json();if(!response.ok)throw new Error(body.error);setSuccess({number:body.number,totalCents:body.totalCents});setCart([]);setPaymentValues({});setCashReceived("");setSelectedPlayer(null);setCheckout(false)}catch(cause){setError(cause instanceof Error?cause.message:"Falha ao finalizar venda.")}finally{setLoading(false)}
  }

  return <div className="min-h-screen bg-slate-100"><header className="bg-[#172744] text-white px-5 py-3 flex justify-between items-center"><div><b className="text-emerald-400 tracking-[.18em] text-xs">COLISEU</b><h1 className="font-black text-xl">Frente de caixa</h1></div><div className="flex items-center gap-2"><span className="hidden sm:inline text-sm text-slate-300">{userName}</span><Link href="/minhas-vendas" className="btn bg-white/10 text-white text-sm">Minhas vendas</Link>{isAdmin&&<Link href="/admin" className="btn bg-white/10 text-white text-sm">Painel</Link>}</div></header>
    <main className="p-4 grid lg:grid-cols-[1.45fr_.75fr] gap-4 max-w-[1600px] mx-auto"><section className="grid gap-4 content-start"><div className="card p-4 relative"><label className="label"><span className="flex gap-2 items-center"><Search size={17}/> Buscar produto <small className="ml-auto text-gray-400">F2</small></span><input ref={inputRef} className="field text-lg" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&results[0])add(results[0])}} placeholder="Nome, SKU ou código de barras" autoFocus disabled={!ready}/></label>{results.length>0&&<div className="absolute z-10 bg-white border rounded-xl shadow-xl left-4 right-4 mt-2 max-h-96 overflow-auto">{results.map(product=><button key={product.id} onClick={()=>add(product)} className="w-full p-3 flex text-left items-center gap-3 border-b hover:bg-slate-50"><div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden">{product.imageKey&&<img src={`/api/uploads/${product.imageKey}`} alt="" className="w-full h-full object-cover"/>}</div><span className="flex-1"><b className="block">{product.name}</b><small className="text-gray-500">{product.sku} · Estoque {product.stockQuantity}</small></span><b>{formatMoney(product.salePriceCents)}</b></button>)}</div>}</div>
      <div className="card"><div className="p-4 flex items-center gap-2"><ShoppingCart size={19}/><h2 className="font-black">Itens da venda</h2><span className="badge badge-ok ml-auto">{cart.reduce((sum,item)=>sum+item.quantity,0)} itens</span></div>{cart.length===0?<div className="text-center p-14 text-gray-400"><ShoppingCart className="mx-auto mb-3" size={42}/><p>Busque um produto para começar.</p></div>:<div className="grid">{cart.map(item=>{const line=item.salePriceCents*item.quantity-calculateDiscount(item.salePriceCents*item.quantity,item.discountBasisPoints);return <article key={item.id} className="p-4 border-t grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-center"><div><b>{item.name}</b><p className="text-sm text-gray-500">{item.sku} · {formatMoney(item.salePriceCents)} / {item.unitCode}</p></div><div className="flex items-center"><button className="btn btn-ghost p-2" onClick={()=>quantity(item.id,-1)}><Minus size={15}/></button><b className="w-10 text-center">{item.quantity}</b><button className="btn btn-ghost p-2" onClick={()=>quantity(item.id,1)}><Plus size={15}/></button></div><label className="label text-xs">Desconto %<input className="field w-24" type="number" min="0" max={item.maxDiscountBps/100} step="0.01" value={item.discountBasisPoints/100} onChange={event=>changeDiscount(item.id,Number(event.target.value))}/></label><div className="flex items-center gap-3 justify-end"><b className="min-w-24 text-right">{formatMoney(line)}</b><button className="text-red-600" onClick={()=>setCart(old=>old.filter(value=>value.id!==item.id))}><Trash2 size={18}/></button></div></article>})}</div>}</div></section>
      <aside className="card p-5 h-fit lg:sticky lg:top-4"><p className="text-sm text-gray-500 font-bold">RESUMO</p><div className="grid gap-3 py-5 border-b"><div className="flex justify-between"><span>Subtotal</span><b>{formatMoney(subtotal)}</b></div><div className="flex justify-between text-emerald-700"><span>Descontos</span><b>- {formatMoney(discount)}</b></div></div><div className="flex justify-between items-end py-6"><span className="font-bold">TOTAL</span><strong className="text-4xl">{formatMoney(total)}</strong></div><button className="btn btn-success w-full text-lg py-4" disabled={!cart.length} onClick={()=>setCheckout(true)}>Finalizar venda <small>F4</small></button><button className="btn btn-ghost w-full mt-2" disabled={!cart.length} onClick={()=>confirm("Limpar o carrinho?")&&setCart([])}>Limpar</button></aside></main>
    {checkout&&<div className="fixed inset-0 bg-black/50 z-20 grid place-items-center p-4"><section className="card w-full max-w-2xl max-h-[90vh] overflow-auto p-6 grid gap-5"><header className="flex justify-between"><div><p className="text-sm text-gray-500 font-bold">CONFIRMAÇÃO</p><h2 className="text-2xl font-black">Pagamento</h2></div><button onClick={()=>setCheckout(false)}><X/></button></header><div className="bg-slate-100 rounded-xl p-4 flex justify-between"><span>Total da venda</span><b className="text-2xl">{formatMoney(total)}</b></div>
      <div className="grid sm:grid-cols-2 gap-3">{methods.map(method=><label className="label" key={method.code}>{method.name}<input className="field" inputMode="decimal" placeholder="0,00" value={paymentValues[method.code]??""} onChange={event=>setPaymentValues(value=>({...value,[method.code]:event.target.value}))}/>{method.code==="CASH"&&paymentValues.CASH&&<><span>Valor recebido</span><input className="field" inputMode="decimal" value={cashReceived} onChange={event=>setCashReceived(event.target.value)} placeholder="0,00"/></>}{method.code==="FUTURE"&&usesFuture&&<><span>Vencimento</span><input className="field" type="date" value={futureDueDate} onChange={event=>setFutureDueDate(event.target.value)}/></>}</label>)}</div>
      {needsPlayer&&<div className="border rounded-xl p-4 grid gap-3 relative"><label className="label">Buscar jogador<input className="field" value={playerQuery} onChange={event=>{setPlayerQuery(event.target.value);setSelectedPlayer(null)}} placeholder="Nome, e-mail ou telefone"/></label>{playerResults.length>0&&!selectedPlayer&&<div className="absolute z-10 top-20 left-4 right-4 bg-white border shadow-xl rounded-xl overflow-hidden">{playerResults.map(player=><button key={player.id} className="w-full text-left p-3 border-b hover:bg-slate-50 flex justify-between" onClick={()=>{setSelectedPlayer(player);setPlayerQuery(player.name);setPlayerResults([])}}><span><b className="block">{player.name}</b><small>{player.email||player.phone||"Sem contato"}</small></span><b className={player.creditBalanceCents<0?"text-red-600":"text-emerald-700"}>{formatMoney(player.creditBalanceCents)}</b></button>)}</div>}{selectedPlayer&&<div className="bg-emerald-50 rounded-lg p-3 flex justify-between"><span><b className="block">{selectedPlayer.name}</b><small>Saldo disponível (pode ficar negativo)</small></span><strong className={selectedPlayer.creditBalanceCents<0?"text-red-600":"text-emerald-700"}>{formatMoney(selectedPlayer.creditBalanceCents)}</strong></div>}</div>}
      <p className="text-sm text-gray-500">Distribua o total entre uma ou mais formas. Crédito e pagamento futuro exigem um jogador e ficam registrados no extrato.</p>{error&&<p className="notice-error">{error}</p>}<button className="btn btn-success py-3" disabled={loading} onClick={finish}>{loading?"Finalizando...":"Confirmar venda"}</button></section></div>}
    {success&&<div className="fixed inset-0 bg-black/50 z-30 grid place-items-center p-4"><section className="card max-w-md w-full p-8 text-center"><div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full grid place-items-center text-3xl mx-auto">✓</div><h2 className="text-2xl font-black mt-4">Venda concluída</h2><p className="text-gray-500 mt-1">{success.number}</p><strong className="text-3xl block my-5">{formatMoney(success.totalCents)}</strong><button className="btn btn-primary w-full" onClick={()=>{setSuccess(null);inputRef.current?.focus()}}>Nova venda</button></section></div>}
  </div>;
}
