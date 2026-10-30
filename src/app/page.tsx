import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  FileCheck2,
  Gauge,
  Handshake,
  Lock,
  MessageCircle,
  PackageCheck,
  PackageOpen,
  ReceiptText,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UsersRound,
  WalletCards,
  Zap,
} from "lucide-react";
import styles from "./landing.module.css";

const shareTitle = "Gestão completa para lojas de TCG";
const shareDescription = "PDV, estoque, financeiro, jogadores e notas fiscais em um sistema feito por lojista, para lojista de TCG.";

export const metadata: Metadata = {
  title: shareTitle,
  description: shareDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: `Coliseon PDV — ${shareTitle}`,
    description: shareDescription,
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Coliseon PDV",
  },
  twitter: {
    card: "summary_large_image",
    title: `Coliseon PDV — ${shareTitle}`,
    description: shareDescription,
  },
};

/* O contato muda o destino dos botões de plano; sem ele, eles levam à seção de contato da própria página. */
export const dynamic = "force-dynamic";
const contactUrl = () => process.env.CONTACT_URL?.trim() || "";

const hooks = [
  { question: "O caixa fechou e a conta não bate?", answer: "Abertura, suprimento, sangria e fechamento com conferência por operador. A diferença aparece na hora, não no fim do mês.", icon: ScanBarcode },
  { question: "Abriu uma box e perdeu o custo?", answer: "Abra produtos lacrados em boosters: o sistema baixa a box e divide o custo entre as unidades.", icon: PackageOpen },
  { question: "Chegou a nota, mas veio menos mercadoria?", answer: "Confira o recebimento item a item: chegou, faltou ou não entra no estoque. Só o que chegou é lançado.", icon: PackageCheck },
  { question: "Saldo de jogador no caderninho?", answer: "Crédito, dívida e extrato de cada jogador, usados direto como forma de pagamento no PDV.", icon: UsersRound },
] as const;

const principles = [
  { icon: Store, title: "Nasceu no balcão", text: "Cada tela foi pensada para o que acontece de verdade na loja: venda corrida, nota chegando, evento lotado, caixa para fechar." },
  { icon: Handshake, title: "Fala a língua do lojista", text: "Caixa, sangria, box, booster, falta, duplicata. Sem jargão de sistema, para o operador novo se achar logo." },
  { icon: Gauge, title: "Direto ao ponto", text: "Poucos cliques para vender, conferir e fechar. O que é raro fica fora do caminho; o que é diário fica à mão." },
] as const;

const reasons = [
  { icon: Store, title: "Entende a rotina de uma loja de TCG", text: "Boxes, boosters, cartas avulsas, idioma, raridade e condição são parte do cadastro, não gambiarra em campo livre." },
  { icon: FileCheck2, title: "Da nota ao estoque sem redigitar", text: "Receba NF-e pela SEFAZ ou importe XMLs em lote. Itens, custos e duplicatas entram juntos e o documento original fica guardado." },
  { icon: PackageCheck, title: "Conferência de quem recebe mercadoria", text: "Chegou menos do que a nota diz? Lance a quantidade real, registre a falta e dê entrada depois, quando chegar." },
  { icon: WalletCards, title: "Financeiro que nasce sozinho", text: "As duplicatas viram contas a pagar agrupadas por fornecedor, com vencimentos claros, baixa em lote e conciliação." },
  { icon: BarChart3, title: "Decisão com número, não com achismo", text: "Faturamento, ticket médio, mais vendidos, margem aproximada, estoque baixo e estoque parado." },
  { icon: Lock, title: "Seguro desde o primeiro dia", text: "Perfis de acesso, autenticação em duas etapas e auditoria: você sabe quem mexeu em quê e quando." },
  { icon: Smartphone, title: "No celular, no tablet e no computador", text: "Layout que se adapta à tela e instalação como aplicativo, em tela cheia, direto da página." },
  { icon: ReceiptText, title: "Menos planilha, menos erro", text: "Um único lugar para vendas, compras, financeiro e jogadores. O dado é digitado uma vez e segue para onde precisa." },
] as const;

const comparison = [
  { topic: "Abrir uma box em boosters", usual: "Baixa manual e custo calculado na mão", coliseon: "Baixa a box, gera os boosters e rateia o custo de cada unidade" },
  { topic: "Entrada de uma nota de compra", usual: "Digitar item por item", coliseon: "XML ou SEFAZ, com conferência: chegou, faltou ou não entra" },
  { topic: "Crédito e dívida de jogadores", usual: "Caderno ou planilha", coliseon: "Saldo, extrato e pagamento direto no PDV" },
  { topic: "Detalhes da carta ou do produto", usual: "Tudo no nome do produto", coliseon: "Jogo, coleção, idioma, raridade e condição em campos próprios" },
  { topic: "Contas a pagar", usual: "Lançadas depois, quando dá", coliseon: "Geradas das duplicatas da nota, por fornecedor" },
  { topic: "Quem alterou o quê", usual: "Ninguém sabe", coliseon: "Auditoria de cada alteração, com usuário e data" },
] as const;

const tcgFeatures = [
  { icon: PackageOpen, title: "Box vira booster", text: "Abra produtos lacrados e venda as unidades avulsas com o custo certo." },
  { icon: Boxes, title: "Cadastro de TCG", text: "Jogo, coleção, número, idioma, raridade e condição (NM, SP, MP, HP, lacrado)." },
  { icon: UsersRound, title: "Crédito de jogador", text: "Saldo, dívida e extrato, com uso do crédito direto na venda." },
  { icon: ScanBarcode, title: "Etiquetas com código", text: "Gere o código de barras e imprima etiquetas com preço e SKU." },
] as const;

const plans = [
  {
    name: "Essencial",
    audience: "Para começar a vender com controle",
    featured: false,
    features: [
      "PDV com código de barras e pagamentos combinados",
      "Caixas: abertura, sangria, suprimento e fechamento",
      "Estoque com histórico de movimentações",
      "Produtos, categorias e formas de pagamento",
      "Autenticação em duas etapas",
      "Instalação no celular e no computador",
    ],
  },
  {
    name: "Profissional",
    audience: "Para quem quer a casa em ordem",
    featured: true,
    features: [
      "Tudo do Essencial",
      "Jogadores: crédito, dívida e extrato",
      "Inventários com contagem e ajuste",
      "Etiquetas com código de barras",
      "Financeiro: contas a pagar e a receber, baixa em lote",
      "Compras: pedidos, fornecedores e recebimento",
      "Dashboard completo",
      "Fiscal disponível como adicional",
    ],
  },
  {
    name: "Completo",
    audience: "Para operar com fiscal e total controle",
    featured: false,
    features: [
      "Tudo do Profissional",
      "NF-e pela SEFAZ e importação de XML em lote",
      "Conferência de recebimento da nota",
      "Conciliação bancária (OFX)",
      "Auditoria completa de alterações",
      "Usuários e caixas sem limite",
    ],
  },
] as const;

const faqs = [
  { question: "O Coliseon serve só para loja de TCG?", answer: "Ele foi pensado para TCG: abrir box em boosters, detalhes da carta e crédito de jogadores. O PDV, o estoque e o financeiro também funcionam para outros produtos da sua loja." },
  { question: "Preciso de internet para usar?", answer: "Sim. As vendas e as consultas dependem de conexão. Você pode instalar o Coliseon no celular, no tablet ou no computador para abrir em tela cheia, e se a conexão cair o sistema avisa e volta sozinho quando ela retorna." },
  { question: "Ele emite nota fiscal de venda?", answer: "Hoje o Coliseon recebe e organiza as NF-e de compra (pela SEFAZ ou por XML) para alimentar estoque e financeiro. A emissão de nota fiscal de venda não está incluída." },
  { question: "Preciso de certificado digital?", answer: "Para receber as NF-e automaticamente pela SEFAZ, sim: é usado o certificado A1 do CNPJ da loja. Se preferir, você pode importar os XMLs em lote, sem certificado." },
  { question: "Meus dados ficam protegidos?", answer: "O acesso é por perfil de usuário, com autenticação em duas etapas, sessões protegidas e auditoria das alterações, para você saber quem fez o quê." },
  { question: "Como funcionam os planos e os valores?", answer: "Os planos organizam os recursos conforme a fase da sua loja. Os valores são combinados diretamente com você: fale com a gente e monte o plano que cabe na sua operação." },
] as const;

const modules = [
  {
    icon: ScanBarcode,
    title: "PDV rápido e flexível",
    description:
      "Venda por código de barras, aplique descontos seguros e combine PIX, cartão, dinheiro, crédito e pagamento futuro.",
    tone: "green",
  },
  {
    icon: PackageOpen,
    title: "Estoque pensado para TCG",
    description:
      "Controle produtos lacrados e boosters avulsos, abra boxes com custo rateado e acompanhe cada movimentação.",
    tone: "blue",
  },
  {
    icon: FileCheck2,
    title: "Fiscal integrado",
    description:
      "Receba NF-e pelo SEFAZ com certificado A1 ou importe XMLs em lote para alimentar estoque e financeiro.",
    tone: "violet",
  },
  {
    icon: WalletCards,
    title: "Financeiro organizado",
    description:
      "Duplicatas agrupadas por fornecedor, vencimentos claros e baixas registradas sem depender de planilhas.",
    tone: "amber",
  },
  {
    icon: UsersRound,
    title: "Crédito de jogadores",
    description:
      "Mantenha saldo, dívida e extrato de cada jogador e use o crédito diretamente como forma de pagamento.",
    tone: "rose",
  },
  {
    icon: ShieldCheck,
    title: "Controle e segurança",
    description:
      "Perfis de acesso, autenticação em duas etapas e auditoria para saber quem fez cada alteração.",
    tone: "slate",
  },
] as const;

const pains = [
  "Estoque que não fecha com o caixa",
  "Boxes e boosters controlados manualmente",
  "Notas e duplicatas digitadas mais de uma vez",
  "Mercadoria que chega diferente do que a nota diz",
  "Créditos de jogadores espalhados em planilhas",
];

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`${styles.brand} ${dark ? styles.brandDark : ""}`}>
      <span className={styles.brandMark} aria-hidden="true">
        C
      </span>
      <span>
        <strong>COLISEON</strong>
        <small>PDV & GESTÃO</small>
      </span>
    </span>
  );
}

function DashboardPreview() {
  const bars = [36, 51, 43, 69, 56, 74, 62, 88, 76, 94, 83, 100, 91, 108];
  return (
    <div className={styles.browser} aria-label="Prévia do dashboard do Coliseon PDV">
      <div className={styles.browserBar}>
        <span />
        <span />
        <span />
        <div>sualoja.com.br/admin</div>
      </div>
      <div className={styles.dashboardShell}>
        <aside className={styles.previewNav}>
          <Brand dark />
          <div className={styles.previewNavGroup}>
            <small>VISÃO GERAL</small>
            <b><BarChart3 size={12} /> Dashboard</b>
          </div>
          <div className={styles.previewNavGroup}>
            <small>OPERAÇÃO</small>
            <span>Vendas</span><span>Caixas</span><span>Estoque</span><span>Financeiro</span>
          </div>
          <div className={styles.previewNavGroup}>
            <small>CATÁLOGO</small>
            <span>Produtos</span><span>Categorias</span>
          </div>
        </aside>
        <div className={styles.dashboardContent}>
          <div className={styles.previewHeading}>
            <div><small>VISÃO GERAL</small><b>Dashboard</b></div>
            <span>Hoje, 16 de outubro</span>
          </div>
          <div className={styles.kpiGrid}>
            <div><small>HOJE</small><b>R$ 4.286,90</b><em>+12,4%</em></div>
            <div><small>SEMANA</small><b>R$ 18.540</b><em>+8,2%</em></div>
            <div><small>TICKET MÉDIO</small><b>R$ 187,40</b><em>96 vendas</em></div>
            <div><small>ESTOQUE BAIXO</small><b>12 itens</b><em className={styles.warning}>Revisar</em></div>
          </div>
          <div className={styles.chartGrid}>
            <div className={styles.chartCard}>
              <div><b>Faturamento</b><small>ÚLTIMOS 14 DIAS</small></div>
              <div className={styles.bars}>
                {bars.map((height, index) => <i key={index} style={{ height: `${height / 1.2}px` }} />)}
              </div>
              <div className={styles.chartAxis}><span>03 out</span><span>09 out</span><span>16 out</span></div>
            </div>
            <div className={styles.paymentCard}>
              <div><b>Pagamentos</b><small>ESTE MÊS</small></div>
              <div className={styles.donut}><span>R$ 42 mil</span></div>
              <ul><li><i />PIX <b>48%</b></li><li><i />Cartão <b>31%</b></li><li><i />Outros <b>21%</b></li></ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PosPreview() {
  return (
    <div className={styles.appPreview} aria-label="Prévia da frente de caixa">
      <div className={styles.appTopbar}><Brand dark /><span>Operador: Diego</span></div>
      <div className={styles.posBody}>
        <div className={styles.posMain}>
          <div className={styles.fakeSearch}><ScanBarcode size={15} /> Nome, SKU ou código de barras <kbd>F2</kbd></div>
          <div className={styles.fakePanel}>
            <header><b>Itens da venda</b><span>3 itens</span></header>
            <div className={styles.productRow}><i className={styles.productMagic}>M</i><p><b>Magic: Play Booster</b><small>MTG-FOUND-BOOSTER · R$ 39,90</small></p><strong>2</strong><em>R$ 79,80</em></div>
            <div className={styles.productRow}><i className={styles.productPokemon}>P</i><p><b>Pokémon — Triple Pack</b><small>PKM-TRIPLE-001 · R$ 89,90</small></p><strong>1</strong><em>R$ 89,90</em></div>
          </div>
        </div>
        <aside className={styles.cartPreview}>
          <small>RESUMO</small>
          <p><span>Subtotal</span><b>R$ 169,70</b></p>
          <p><span>Descontos</span><b className={styles.greenText}>− R$ 4,00</b></p>
          <div><span>TOTAL</span><strong>R$ 165,70</strong></div>
          <button>Finalizar venda <kbd>F4</kbd></button>
        </aside>
      </div>
    </div>
  );
}

function FiscalPreview() {
  return (
    <div className={styles.appPreview} aria-label="Prévia da gestão de notas fiscais">
      <div className={styles.miniPageHeader}>
        <div><small>FISCAL</small><b>Notas fiscais recebidas</b></div>
        <button>Importação e SEFAZ <ChevronRight size={14} /></button>
      </div>
      <div className={styles.fiscalStats}>
        <div><FileCheck2 size={16} /><span><small>NOTAS INTEGRADAS</small><b>128</b></span></div>
        <div><Boxes size={16} /><span><small>ITENS IMPORTADOS</small><b>1.847</b></span></div>
        <div><BadgeDollarSign size={16} /><span><small>VALOR NO MÊS</small><b>R$ 84.290</b></span></div>
      </div>
      <div className={styles.fakeTable}>
        <div className={styles.tableHead}><span>EMITENTE</span><span>NOTA</span><span>EMISSÃO</span><span>VALOR</span><span>STATUS</span></div>
        <div><b>Distribuidora Alfa de Cards</b><span>000.014.892</span><span>15/10/2026</span><strong>R$ 12.480,00</strong><em>Integrada</em></div>
        <div><b>Importadora Beta Games</b><span>000.008.341</span><span>14/10/2026</span><strong>R$ 8.750,40</strong><em>Integrada</em></div>
        <div><b>Gama Jogos e Acessórios</b><span>000.019.204</span><span>11/10/2026</span><strong>R$ 4.190,00</strong><em>Integrada</em></div>
      </div>
    </div>
  );
}

function FinancePreview() {
  return (
    <div className={styles.appPreview} aria-label="Prévia do painel financeiro">
      <div className={styles.miniPageHeader}>
        <div><small>FINANCEIRO</small><b>Duplicatas por fornecedor</b></div>
        <span className={styles.monthPill}>Outubro de 2026</span>
      </div>
      <div className={styles.financeNumbers}>
        <div><small>A PAGAR</small><b>R$ 38.420,80</b><span>18 duplicatas</span></div>
        <div><small>VENCE EM 7 DIAS</small><b>R$ 9.840,00</b><span className={styles.amberText}>5 vencimentos</span></div>
        <div><small>PAGO NO MÊS</small><b>R$ 24.680,50</b><span className={styles.greenText}>Tudo registrado</span></div>
      </div>
      <div className={styles.supplierList}>
        <div><i>DA</i><p><b>Distribuidora Alfa de Cards</b><small>4 duplicatas · Próximo vencimento em 6 dias</small></p><strong>R$ 18.240,00</strong><ChevronRight size={16} /></div>
        <div><i>IB</i><p><b>Importadora Beta Games</b><small>2 duplicatas · Próximo vencimento em 14 dias</small></p><strong>R$ 8.750,40</strong><ChevronRight size={16} /></div>
      </div>
    </div>
  );
}

function ReceiptPreview() {
  return (
    <div className={styles.appPreview} aria-label="Prévia da conferência de recebimento da nota">
      <div className={styles.miniPageHeader}>
        <div><small>NF-e 9876</small><b>Conferir recebimento</b></div>
        <span className={styles.monthPill}>4 itens</span>
      </div>
      <div className={styles.receiptAsk}><b>Todos os itens da nota chegaram?</b><span>Sim, tudo chegou</span><span className={styles.receiptActive}>Não, conferir item a item</span></div>
      <div className={styles.receiptList}>
        <div className={styles.receiptOk}><CircleCheck size={14} /><p><b>Booster Box — Magic (36)</b><small>10 UN × R$ 950,00</small></p><em>Chegou · 10 de 10</em></div>
        <div className={styles.receiptOk}><CircleCheck size={14} /><p><b>Elite Trainer Box — Pokémon</b><small>20 UN × R$ 210,00</small></p><em>Chegou · 18 de 20</em></div>
        <div className={styles.receiptMissing}><CircleHelp size={14} /><p><b>Sleeves premium (100 un.)</b><small>50 UN × R$ 18,00</small></p><em>Faltou</em></div>
        <div className={styles.receiptSkip}><CircleX size={14} /><p><b>Embalagem de expedição</b><small>1 UN × R$ 45,00</small></p><em>Não entra</em></div>
      </div>
      <div className={styles.receiptSummary}>2 de 4 itens entram no estoque (28 unidades) · 1 com quantidade menor · 1 com falta · 1 fora do estoque</div>
    </div>
  );
}

export default function Home() {
  const contact = contactUrl();
  const external = contact ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <main className={styles.landing}>
      <a href="#planos" className={styles.announce}><Handshake size={15} /> Feito por lojista, para lojista · <b>Veja os planos</b> <ArrowRight size={14} /></a>
      <header className={styles.siteHeader}>
        <div className={styles.container}>
          <Link href="/" aria-label="Coliseon PDV — início"><Brand /></Link>
          <nav aria-label="Navegação principal">
            <a href="#motivos">Por que o Coliseon</a>
            <a href="#recursos">Recursos</a>
            <a href="#diferenciais">Diferenciais</a>
            <a href="#planos">Planos</a>
            <a href="#perguntas">Perguntas</a>
          </nav>
          <Link href="/login" className={styles.loginLink}>Acessar sistema <ArrowRight size={16} /></Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><Sparkles size={14} /> Feito para lojas de TCG</div>
            <h1>Feito por lojista,<br /><span>para lojista.</span></h1>
            <p>Caixa que fecha, estoque que bate e mês que termina sem susto. Venda, compre, confira a nota e acompanhe o financeiro em um sistema que entende a rotina da sua loja.</p>
            <div className={styles.heroActions}>
              <a href="#planos" className={styles.primaryCta}>Ver os planos <ArrowRight size={18} /></a>
              <a href="#motivos" className={styles.secondaryCta}>Por que o Coliseon</a>
            </div>
            <div className={styles.heroChecks}>
              <span><Check size={15} /> Sem planilhas</span>
              <span><Check size={15} /> Pensado para TCG</span>
              <span><Check size={15} /> Instala no celular</span>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.glow} />
            <DashboardPreview />
            <div className={styles.floatingBadge}><span><Zap size={16} /></span><p><b>Visão em tempo real</b><small>Decida com dados, não suposições</small></p></div>
          </div>
        </div>
      </section>

      <section className={styles.trustStrip}>
        <div className={styles.container}>
          <p>UMA OPERAÇÃO COMPLETA, SEM REMENDOS</p>
          <div><span><ScanBarcode /> Frente de caixa</span><span><Boxes /> Estoque</span><span><WalletCards /> Financeiro</span><span><ReceiptText /> Fiscal</span><span><UsersRound /> Jogadores</span></div>
        </div>
      </section>

      <section className={styles.hooksSection} aria-labelledby="ganchos">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionTag}>VOCÊ JÁ PASSOU POR ISSO?</span>
            <h2 id="ganchos">Todo lojista conhece essas dores.</h2>
            <p>Foram elas que moldaram o Coliseon. Cada uma tem uma resposta pronta dentro do sistema.</p>
          </div>
          <div className={styles.hookGrid}>
            {hooks.map(({ icon: Icon, question, answer }) => (
              <article key={question}>
                <span><Icon size={20} /></span>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.storySection} aria-labelledby="lojista">
        <div className={`${styles.container} ${styles.storyCard}`}>
          <div className={styles.storyCopy}>
            <span className={styles.storyTag}><Handshake size={14} /> DE LOJISTA PARA LOJISTA</span>
            <h2 id="lojista">Quem vive o balcão sabe o que a loja precisa.</h2>
            <p>O Coliseon não nasceu em uma sala de reunião. Ele nasceu da rotina de quem vende, compra, confere mercadoria e fecha o mês. Por isso cada recurso resolve um problema real de loja, e cada tela fala a sua língua.</p>
            <Link href="#planos" className={styles.lightCta}>Conhecer os planos <ArrowRight size={18} /></Link>
          </div>
          <div className={styles.principles}>
            {principles.map(({ icon: Icon, title, text }) => (
              <div key={title}><span><Icon size={20} /></span><p><b>{title}</b>{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.reasonsSection} id="motivos" aria-labelledby="motivos-titulo">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionTag}>MOTIVOS PARA ESCOLHER</span>
            <h2 id="motivos-titulo">Por que lojistas escolhem o Coliseon.</h2>
            <p>Menos tempo digitando e conferindo, mais tempo vendendo e atendendo o seu cliente.</p>
          </div>
          <div className={styles.reasonGrid}>
            {reasons.map(({ icon: Icon, title, text }, index) => (
              <article key={title}>
                <div><span><Icon size={20} /></span><em>{String(index + 1).padStart(2, "0")}</em></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.painSection}>
        <div className={`${styles.container} ${styles.painGrid}`}>
          <div>
            <span className={styles.sectionTag}>MENOS IMPROVISO</span>
            <h2>Sua loja cresceu.<br />A gestão precisa acompanhar.</h2>
            <p>Quando cada área vive em uma planilha, pequenos erros viram prejuízo. O Coliseon conecta toda a operação e mantém o histórico no lugar certo.</p>
          </div>
          <div className={styles.painList}>
            {pains.map((pain) => <div key={pain}><span>×</span><p>{pain}</p><CircleCheck size={21} /></div>)}
          </div>
        </div>
      </section>

      <section className={styles.modulesSection} id="recursos">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionTag}>TUDO CONECTADO</span>
            <h2>Uma plataforma. Toda a sua operação.</h2>
            <p>Recursos que conversam entre si para sua equipe trabalhar com mais velocidade e menos erro.</p>
          </div>
          <div className={styles.moduleGrid}>
            {modules.map(({ icon: Icon, title, description, tone }) => (
              <article key={title}>
                <span className={styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.diffSection} id="diferenciais" aria-labelledby="diferenciais-titulo">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionTag}>DIFERENCIAIS</span>
            <h2 id="diferenciais-titulo">O que muda no seu dia a dia.</h2>
            <p>A rotina que você já conhece, resolvida do jeito que uma loja de TCG realmente trabalha.</p>
          </div>
          <div className={styles.diffTable} role="table" aria-label="Comparação entre a rotina comum e o Coliseon">
            <div className={styles.diffHead} role="row"><span role="columnheader">Na rotina</span><span role="columnheader">Como costuma ser</span><span role="columnheader">No Coliseon</span></div>
            {comparison.map((row) => (
              <div className={styles.diffRow} role="row" key={row.topic}>
                <b role="cell">{row.topic}</b>
                <p role="cell"><CircleX size={16} /> {row.usual}</p>
                <p role="cell"><CircleCheck size={16} /> {row.coliseon}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.showcase} id="sistema">
        <div className={styles.container}>
          <div className={styles.showcaseRow}>
            <div className={styles.showcaseCopy}>
              <span className={styles.number}>01</span>
              <span className={styles.sectionTag}>VENDA SEM ATRITO</span>
              <h2>Um PDV simples para quem vende. Completo para quem gerencia.</h2>
              <p>Busca instantânea, atalhos de teclado, carrinho persistente e pagamentos combinados. O operador ganha velocidade sem abrir mão das regras da loja.</p>
              <ul><li><Check /> Leitor de código de barras</li><li><Check /> Pagamento dividido e troco</li><li><Check /> Crédito e dívida de jogadores</li></ul>
            </div>
            <div className={styles.screenWrap}><PosPreview /></div>
          </div>

          <div className={`${styles.showcaseRow} ${styles.reverse}`}>
            <div className={styles.showcaseCopy}>
              <span className={styles.number}>02</span>
              <span className={styles.sectionTag}>DO XML AO ESTOQUE</span>
              <h2>Notas fiscais deixam de ser trabalho repetitivo.</h2>
              <p>O sistema interpreta as NF-e recebidas, extrai os itens e preserva o documento original. Produtos, custos e duplicatas seguem juntos.</p>
              <ul><li><Check /> Integração SEFAZ com certificado A1</li><li><Check /> Importação de XML em lote</li><li><Check /> Entrada rastreada no estoque</li></ul>
            </div>
            <div className={styles.screenWrap}><FiscalPreview /></div>
          </div>

          <div className={styles.showcaseRow}>
            <div className={styles.showcaseCopy}>
              <span className={styles.number}>03</span>
              <span className={styles.sectionTag}>CONFERÊNCIA DE RECEBIMENTO</span>
              <h2>Só entra no estoque o que realmente chegou.</h2>
              <p>Ao receber uma nota, confira item a item: chegou, faltou ou não entra no estoque. Veio menos do que a nota diz? Lance a quantidade real e dê entrada no restante quando chegar.</p>
              <ul><li><Check /> Entrada parcial com o custo da nota</li><li><Check /> Falta registrada para cobrar o fornecedor</li><li><Check /> Itens de uso da loja ficam de fora</li></ul>
            </div>
            <div className={styles.screenWrap}><ReceiptPreview /></div>
          </div>

          <div className={`${styles.showcaseRow} ${styles.reverse}`}>
            <div className={styles.showcaseCopy}>
              <span className={styles.number}>04</span>
              <span className={styles.sectionTag}>PREVISIBILIDADE</span>
              <h2>Saiba o que vence, para quem e quando.</h2>
              <p>As duplicatas das notas entram automaticamente e ficam agrupadas por fornecedor, com baixa manual e histórico completo.</p>
              <ul><li><Check /> Prazos 30, 60 e 90 dias</li><li><Check /> Alertas de vencimento</li><li><Check /> Fluxo financeiro realizado</li></ul>
            </div>
            <div className={styles.screenWrap}><FinancePreview /></div>
          </div>
        </div>
      </section>

      <section className={styles.specialSection} aria-labelledby="tcg">
        <div className={`${styles.container} ${styles.specialCard}`}>
          <div className={styles.specialHead}>
            <div className={styles.specialIcon}><PackageOpen /></div>
            <div><span className={styles.sectionTag}>FEITO PARA TCG</span><h2 id="tcg">Abra boxes. Venda boosters. Mantenha o custo correto.</h2></div>
            <p>O Coliseon transforma produtos lacrados em unidades avulsas, baixa a quantidade exata do estoque e rateia automaticamente o custo de cada booster.</p>
          </div>
          <div className={styles.tcgGrid}>
            {tcgFeatures.map(({ icon: Icon, title, text }) => (
              <div key={title}><span><Icon size={18} /></span><b>{title}</b><p>{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.plansSection} id="planos" aria-labelledby="planos-titulo">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionTag}>PLANOS</span>
            <h2 id="planos-titulo">Um plano para cada fase da sua loja.</h2>
            <p>Comece pelo que você precisa hoje e avance quando a operação pedir. Os valores são combinados de lojista para lojista, sem tabela engessada.</p>
          </div>
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article key={plan.name} className={plan.featured ? styles.planFeatured : undefined}>
                {plan.featured && <span className={styles.planBadge}><Sparkles size={12} /> Recomendado</span>}
                <h3>{plan.name}</h3>
                <p className={styles.planAudience}>{plan.audience}</p>
                <div className={styles.planPrice}><strong>Valor sob consulta</strong><small>{contact ? "Fale com a gente e monte o plano da sua loja" : "Condições combinadas diretamente com a equipe do Coliseon"}</small></div>
                {contact && <a href={contact} className={plan.featured ? styles.primaryCta : styles.secondaryCta} {...external}>Falar sobre este plano <ArrowRight size={16} /></a>}
                <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} />{feature}</li>)}</ul>
              </article>
            ))}
          </div>
          <p className={styles.planNote}><ShieldCheck size={16} /> Todos os planos têm acesso por perfil e autenticação em duas etapas. Precisa de algo diferente? Conte a sua realidade e a gente conversa.</p>
        </div>
      </section>

      <section className={styles.faqSection} id="perguntas" aria-labelledby="faq-titulo">
        <div className={`${styles.container} ${styles.faqGrid}`}>
          <div>
            <span className={styles.sectionTag}>PERGUNTAS FREQUENTES</span>
            <h2 id="faq-titulo">Dúvidas comuns antes de começar.</h2>
            <p>Respostas diretas, inclusive sobre o que o Coliseon ainda não faz.</p>
          </div>
          <div className={styles.faqList}>
            {faqs.map((item) => (
              <details key={item.question}>
                <summary>{item.question}<ChevronDown size={18} /></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta} id="contato">
        <div className={styles.container}>
          <div>
            <span className={styles.sectionTag}>VAMOS CONVERSAR?</span>
            <h2>Mais controle para sua loja.<br />Mais tempo para o seu negócio.</h2>
            <p>{contact ? "Conte como é a sua loja e a gente indica o plano que faz sentido. Conversa de lojista para lojista." : "Centralize a operação e acompanhe cada venda, produto e compromisso financeiro com clareza."}</p>
          </div>
          <div className={styles.finalActions}>
            {contact && <a href={contact} className={styles.lightCta} {...external}><MessageCircle size={18} /> Falar com a gente</a>}
            <Link href="/login" className={contact ? styles.ghostCta : styles.lightCta}>{contact ? "Já sou cliente" : "Acessar o Coliseon"} <ArrowRight size={18} /></Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <Brand dark />
          <p>Feito por lojista, para lojista.</p>
          <nav aria-label="Rodapé"><a href="#planos">Planos</a><a href="#perguntas">Perguntas</a><Link href="/login">Acessar</Link></nav>
          <span>© 2026 Coliseon PDV</span>
        </div>
      </footer>
    </main>
  );
}
