import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  CircleCheck,
  FileCheck2,
  PackageOpen,
  ReceiptText,
  ScanBarcode,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  Zap,
} from "lucide-react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Gestão completa para lojas de TCG",
  description:
    "PDV, estoque, financeiro, jogadores e notas fiscais em um sistema criado para lojas de TCG.",
};

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
  "Créditos de jogadores espalhados em planilhas",
];

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`${styles.brand} ${dark ? styles.brandDark : ""}`}>
      <span className={styles.brandMark} aria-hidden="true">
        C
      </span>
      <span>
        <strong>COLISEU</strong>
        <small>PDV & GESTÃO</small>
      </span>
    </span>
  );
}

function DashboardPreview() {
  const bars = [36, 51, 43, 69, 56, 74, 62, 88, 76, 94, 83, 100, 91, 108];
  return (
    <div className={styles.browser} aria-label="Prévia do dashboard do Coliseu PDV">
      <div className={styles.browserBar}>
        <span />
        <span />
        <span />
        <div>app.coliseupdv.com.br/admin</div>
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
        <div><b>Distribuidora de Cards Brasil</b><span>000.014.892</span><span>15/10/2026</span><strong>R$ 12.480,00</strong><em>Integrada</em></div>
        <div><b>Copag da Amazônia S.A.</b><span>000.008.341</span><span>14/10/2026</span><strong>R$ 8.750,40</strong><em>Integrada</em></div>
        <div><b>Galápagos Jogos</b><span>000.019.204</span><span>11/10/2026</span><strong>R$ 4.190,00</strong><em>Integrada</em></div>
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
        <div><i>DC</i><p><b>Distribuidora de Cards Brasil</b><small>4 duplicatas · Próximo vencimento em 6 dias</small></p><strong>R$ 18.240,00</strong><ChevronRight size={16} /></div>
        <div><i>CA</i><p><b>Copag da Amazônia S.A.</b><small>2 duplicatas · Próximo vencimento em 14 dias</small></p><strong>R$ 8.750,40</strong><ChevronRight size={16} /></div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className={styles.landing}>
      <header className={styles.siteHeader}>
        <div className={styles.container}>
          <Link href="/" aria-label="Coliseu PDV — início"><Brand /></Link>
          <nav aria-label="Navegação principal">
            <a href="#recursos">Recursos</a>
            <a href="#sistema">O sistema</a>
            <a href="#contato">Para sua loja</a>
          </nav>
          <Link href="/login" className={styles.loginLink}>Acessar sistema <ArrowRight size={16} /></Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><Sparkles size={14} /> Feito para lojas de TCG</div>
            <h1>Sua loja no controle.<br /><span>Do caixa ao estoque.</span></h1>
            <p>Venda com agilidade, organize produtos, jogadores, financeiro e notas fiscais em um único sistema — sem perder tempo com planilhas.</p>
            <div className={styles.heroActions}>
              <a href="#sistema" className={styles.primaryCta}>Conhecer o sistema <ArrowRight size={18} /></a>
              <Link href="/login" className={styles.secondaryCta}>Já sou cliente</Link>
            </div>
            <div className={styles.heroChecks}>
              <span><Check size={15} /> Operação centralizada</span>
              <span><Check size={15} /> Estoque rastreável</span>
              <span><Check size={15} /> Pronto para crescer</span>
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

      <section className={styles.painSection}>
        <div className={`${styles.container} ${styles.painGrid}`}>
          <div>
            <span className={styles.sectionTag}>MENOS IMPROVISO</span>
            <h2>Sua loja cresceu.<br />A gestão precisa acompanhar.</h2>
            <p>Quando cada área vive em uma planilha, pequenos erros viram prejuízo. O Coliseu conecta toda a operação e mantém o histórico no lugar certo.</p>
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
              <span className={styles.sectionTag}>PREVISIBILIDADE</span>
              <h2>Saiba o que vence, para quem e quando.</h2>
              <p>As duplicatas das notas entram automaticamente e ficam agrupadas por fornecedor, com baixa manual e histórico completo.</p>
              <ul><li><Check /> Prazos 30, 60 e 90 dias</li><li><Check /> Alertas de vencimento</li><li><Check /> Fluxo financeiro realizado</li></ul>
            </div>
            <div className={styles.screenWrap}><FinancePreview /></div>
          </div>
        </div>
      </section>

      <section className={styles.specialSection}>
        <div className={`${styles.container} ${styles.specialCard}`}>
          <div className={styles.specialIcon}><PackageOpen /></div>
          <div><span className={styles.sectionTag}>FEITO PARA TCG</span><h2>Abra boxes. Venda boosters. Mantenha o custo correto.</h2></div>
          <p>O Coliseu transforma produtos lacrados em unidades avulsas, baixa a quantidade exata do estoque e rateia automaticamente o custo de cada booster.</p>
        </div>
      </section>

      <section className={styles.finalCta} id="contato">
        <div className={styles.container}>
          <div>
            <span className={styles.sectionTag}>PRONTO PARA A PRÓXIMA FASE?</span>
            <h2>Mais controle para sua loja.<br />Mais tempo para o seu negócio.</h2>
            <p>Centralize a operação e acompanhe cada venda, produto e compromisso financeiro com clareza.</p>
          </div>
          <Link href="/login" className={styles.lightCta}>Acessar o Coliseu <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}><Brand dark /><p>Gestão completa para lojas de TCG.</p><span>© 2026 Coliseu PDV</span></div>
      </footer>
    </main>
  );
}
