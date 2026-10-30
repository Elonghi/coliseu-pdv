/* As capturas da tela real são arquivos públicos estáticos; <img> simples evita o otimizador de imagens. */
/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
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

/* O contato muda o destino do botão principal; sem ele, a página não exibe um botão que não leva a lugar nenhum. */
export const dynamic = "force-dynamic";
const contactUrl = () => process.env.CONTACT_URL?.trim() || "";

/* Preencha para assinar a carta com nome, loja e ano reais. Vazio, a assinatura cai no texto genérico abaixo. */
const author = { name: "", store: "", since: "" };

const diaDeCampeonato = [
  { hora: "08:52", lancamento: "Abertura do caixa, fundo de troco", valor: "150,00" },
  { hora: "10:14", lancamento: "Venda 0231, 2 Play Booster, PIX", valor: "79,80" },
  { hora: "11:40", lancamento: "Box de 36 aberta, custo de cada booster (972,00 ÷ 36)", valor: "27,00" },
  { hora: "13:05", lancamento: "NF-e 9876, pedido de 10 caixas, chegaram 8", valor: "entra 8, falta 2" },
  { hora: "13:40", lancamento: "Inscrição paga com o crédito do jogador", valor: "−30,00 crédito" },
  { hora: "15:30", lancamento: "Sangria para depósito", valor: "−200,00" },
  { hora: "19:40", lancamento: "14 vendas em dinheiro no dia", valor: "340,00" },
  { hora: "20:10", lancamento: "Fechamento: esperado 290,00, contado 290,00", valor: "0,00" },
] as const;

const oQueFaz = [
  ["Frente de caixa", "código de barras, desconto com limite, pagamento dividido"],
  ["Caixas", "abertura, suprimento, sangria e fechamento com diferença"],
  ["Estoque", "movimentações com histórico, mínimo e estoque parado"],
  ["Box em booster", "baixa a box e divide o custo entre as unidades"],
  ["Jogadores", "crédito, dívida e extrato, usados direto no PDV"],
  ["Compras", "pedidos, fornecedores e recebimento"],
  ["Fiscal", "NF-e pela SEFAZ ou XML em lote, com conferência de recebimento"],
  ["Financeiro", "duplicatas por fornecedor, baixa em lote, conciliação OFX"],
  ["Inventário", "contagem, divergência e ajuste"],
  ["Etiquetas", "código de barras e preço, prontas para imprimir"],
  ["Segurança", "perfis de acesso, autenticação em duas etapas, auditoria"],
  ["Instalação", "celular, tablet e computador, em tela cheia"],
] as const;

const oQueNaoFaz = [
  ["Nota fiscal de venda.", "Ele recebe e organiza as notas de compra. A emissão da nota de venda não está incluída."],
  ["Funcionar sem internet.", "Venda e consulta dependem de conexão. Instalado, ele avisa quando a conexão cai e volta sozinho quando ela volta."],
  ["Estar nas lojas de aplicativos.", "A instalação é feita pelo navegador, sem passar por loja de aplicativos."],
] as const;

const figuras = [
  { arquivo: "/landing/fig-conferencia.png", largura: 640, altura: 1221, titulo: "Conferência de recebimento", texto: "Chegaram 8 das 10 caixas, as luvas faltaram e a embalagem de expedição não entra no estoque. Só o que chegou é lançado, com o custo da nota.", alt: "Janela de conferência de recebimento da NF-e 9876 com quatro itens: dois recebidos, um em falta e um fora do estoque" },
  { arquivo: "/landing/fig-pdv.png", largura: 1200, altura: 456, titulo: "Frente de caixa", texto: "Dois itens no carrinho. F2 busca o produto, F4 finaliza a venda.", alt: "Tela da frente de caixa com dois produtos no carrinho e o total da venda" },
  { arquivo: "/landing/fig-financeiro.png", largura: 1200, altura: 1172, titulo: "Contas a pagar", texto: "As duplicatas da nota entram sozinhas, agrupadas por fornecedor. A primeira já venceu e aparece em vermelho.", alt: "Tela de contas a pagar com duplicatas agrupadas por fornecedor e uma parcela vencida" },
] as const;

const tamanhos = [
  { modulo: "Frente de caixa, caixas e estoque", essencial: "●", profissional: "●", completo: "●" },
  { modulo: "Produtos, categorias e formas de pagamento", essencial: "●", profissional: "●", completo: "●" },
  { modulo: "Perfis de acesso e autenticação em duas etapas", essencial: "●", profissional: "●", completo: "●" },
  { modulo: "Jogadores: crédito, dívida e extrato", essencial: "–", profissional: "●", completo: "●" },
  { modulo: "Inventários e etiquetas", essencial: "–", profissional: "●", completo: "●" },
  { modulo: "Compras e fornecedores", essencial: "–", profissional: "●", completo: "●" },
  { modulo: "Financeiro: contas a pagar e a receber", essencial: "–", profissional: "●", completo: "●" },
  { modulo: "Fiscal: NF-e por SEFAZ ou XML e conferência de recebimento", essencial: "–", profissional: "adicional", completo: "●" },
  { modulo: "Conciliação bancária (OFX)", essencial: "–", profissional: "–", completo: "●" },
  { modulo: "Auditoria completa de alterações", essencial: "–", profissional: "–", completo: "●" },
  { modulo: "Usuários e caixas", essencial: "poucos", profissional: "mais", completo: "sem limite" },
] as const;

const perguntas = [
  ["Serve só para loja de TCG?", "Foi feito para TCG: box em booster, detalhes da carta e crédito de jogador. O PDV, o estoque e o financeiro também funcionam com outros produtos da sua loja."],
  ["Preciso de internet?", "Sim. Venda e consulta dependem de conexão. Instalado no celular ou no computador, ele abre em tela cheia, avisa quando a conexão cai e volta sozinho quando ela volta."],
  ["Ele emite nota fiscal de venda?", "Não. Hoje ele recebe e organiza as NF-e de compra, pela SEFAZ ou por XML, para alimentar estoque e financeiro."],
  ["Preciso de certificado digital?", "Para receber as NF-e automaticamente pela SEFAZ, sim: usamos o certificado A1 do CNPJ da loja. Se preferir, importe os XMLs em lote, sem certificado."],
  ["Quem vê o quê?", "Cada pessoa tem um perfil. O operador vende e fecha o próprio caixa; o resto você libera por permissão. Dá para ligar a autenticação em duas etapas, e o histórico de alterações fica registrado."],
  ["Quanto custa?", "Depende do tamanho da loja e dos módulos. A gente combina em uma conversa, sem tabela fechada."],
] as const;

function Assinatura() {
  const linhas = [author.name, author.store, author.since && `desde ${author.since}`].filter(Boolean);
  return (
    <p className={styles.signature}>
      <span>{linhas.length ? linhas.join(", ") : "Equipe Coliseon"}</span>
      <small>{linhas.length ? "lojista de TCG" : "lojistas de TCG"}</small>
    </p>
  );
}

function LivroCaixa() {
  return (
    <aside className={styles.ledger} aria-labelledby="livro-caixa">
      <table>
        <caption id="livro-caixa">
          <b>Um sábado de campeonato</b>
          <span>lançamento por lançamento</span>
        </caption>
        <thead>
          <tr><th scope="col">Hora</th><th scope="col">Lançamento</th><th scope="col" className={styles.amount}>Valor</th></tr>
        </thead>
        <tbody>
          {diaDeCampeonato.map((linha) => (
            <tr key={linha.hora}>
              <td className={styles.mono}>{linha.hora}</td>
              <td>{linha.lancamento}</td>
              <td className={`${styles.mono} ${styles.amount}`}>{linha.valor}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row" colSpan={2}>Diferença do caixa</th><td className={`${styles.mono} ${styles.amount}`}>0,00</td></tr>
        </tfoot>
      </table>
      <p>O sistema registra cada linha sozinho. Os valores acima são inventados para o exemplo.</p>
    </aside>
  );
}

export default function Home() {
  const contact = contactUrl();
  const external = contact ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <div className={styles.page}>
      <a href="#carta" className={styles.skip}>Ir para o conteúdo</a>

      <header className={styles.masthead}>
        <div className={styles.wrap}>
          <Link href="/" className={styles.wordmark} aria-label="Coliseon PDV, início">Coliseon<small>PDV e gestão para loja de TCG</small></Link>
          <nav aria-label="Seções da página">
            <a href="#carta">Carta</a>
            <a href="#na-pratica">Na prática</a>
            <a href="#planos">Planos</a>
            <a href="#perguntas">Perguntas</a>
          </nav>
          <Link href="/login" className={styles.access}>Acessar →</Link>
        </div>
      </header>

      <main>
        <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="titulo">
          <div className={styles.heroText}>
            <p className={styles.folio}>Carta aberta a quem tem loja de TCG</p>
            <h1 id="titulo">Feito por lojista,<br /><em>para lojista.</em></h1>
            <p className={styles.lead}>Um PDV, um estoque e um financeiro que conversam entre si, mais a parte fiscal de quem recebe nota de fornecedor. Escrito por quem já fechou caixa de sábado de campeonato com a conta errada.</p>
            <p className={styles.actions}>
              {contact && <a href={contact} className={styles.cta} {...external}>Falar com a gente →</a>}
              <a href="#carta" className={styles.textLink}>Ler a carta ↓</a>
            </p>
          </div>
          <LivroCaixa />
        </section>

        <section id="carta" className={`${styles.wrap} ${styles.section} ${styles.letterSection}`} aria-labelledby="carta-titulo">
          <p className={styles.sectionMark}>§ 1 · A carta</p>
          <article className={styles.letter}>
            <h2 id="carta-titulo">Uma carta para quem tem loja.</h2>
            <p>Se você tem loja de TCG, já fechou o caixa de um sábado de campeonato com a fila na porta e a conta não bateu. Nós somos lojistas. O Coliseon é o sistema que a gente quer usar no balcão.</p>
            <p>Ele cuida das coisas pequenas e chatas. Abrir uma box de 36 boosters e saber quanto custou cada um. Receber uma nota de 10 caixas, abrir o pacote e encontrar 8. Anotar o crédito de um jogador num caderno que depois some. Descobrir só na hora de pagar que a duplicata venceu ontem.</p>
            <p>Por isso ele é um PDV, um estoque e um financeiro que falam entre si. A nota que você recebe vira entrada no estoque e conta a pagar. A venda baixa o estoque e entra no caixa. O dado é digitado uma vez.</p>
            <p>Fizemos as telas para o operador que começou na semana passada. Caixa, sangria, box, booster, falta: as palavras são as da loja. Se alguém precisa de manual para fechar o caixa, a tela está errada.</p>
            <p>Ele também tem limites, e preferimos que você saiba antes de contratar. Está tudo listado mais abaixo, sem letra miúda.</p>
            <p>Os planos são três tamanhos de loja. O valor a gente combina em conversa, porque uma loja de bairro e uma loja com campeonato toda semana não precisam da mesma coisa. Se quiser ver funcionando, é só pedir. Se não servir para a sua loja, a gente diz.</p>
            <Assinatura />
          </article>
        </section>

        <section id="na-pratica" className={`${styles.wrap} ${styles.section}`} aria-labelledby="pratica-titulo">
          <p className={styles.sectionMark}>§ 2 · Na prática</p>
          <h2 id="pratica-titulo" className={styles.sectionTitle}>Como é por dentro.</h2>
          <p className={styles.sectionNote}>Capturas da tela real. Os dados são fictícios.</p>
          <div className={styles.figures}>
            {figuras.map((figura, indice) => (
              <figure key={figura.arquivo} className={styles[`figure${indice + 1}`]}>
                <img src={figura.arquivo} width={figura.largura} height={figura.altura} alt={figura.alt} loading="lazy" decoding="async" />
                <figcaption><b>Fig. {indice + 1} · {figura.titulo}</b>{figura.texto}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="sistema" className={`${styles.wrap} ${styles.section}`} aria-labelledby="sistema-titulo">
          <p className={styles.sectionMark}>§ 3 · O que ele faz e o que não faz</p>
          <div className={styles.indexGrid}>
            <div>
              <h2 id="sistema-titulo" className={styles.sectionTitle}>Hoje ele faz isto.</h2>
              <dl className={styles.index}>
                {oQueFaz.map(([nome, detalhe]) => (
                  <div key={nome}><dt>{nome}</dt><dd>{detalhe}</dd></div>
                ))}
              </dl>
            </div>
            <div className={styles.limits}>
              <h2 className={styles.sectionTitle}>E isto ele não faz.</h2>
              <ol>
                {oQueNaoFaz.map(([titulo, texto]) => (
                  <li key={titulo}><b>{titulo}</b> {texto}</li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="planos" className={`${styles.wrap} ${styles.section}`} aria-labelledby="planos-titulo">
          <p className={styles.sectionMark}>§ 4 · Planos</p>
          <h2 id="planos-titulo" className={styles.sectionTitle}>Três tamanhos de loja.</h2>
          <p className={styles.sectionNote}>Cada coluna inclui o que está marcado. O valor é combinado em conversa.</p>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Comparação dos planos">
            <table className={styles.plans}>
              <thead>
                <tr><th scope="col">Recurso</th><th scope="col">Essencial</th><th scope="col">Profissional</th><th scope="col">Completo</th></tr>
              </thead>
              <tbody>
                {tamanhos.map((linha) => (
                  <tr key={linha.modulo}>
                    <th scope="row">{linha.modulo}</th>
                    {[linha.essencial, linha.profissional, linha.completo].map((celula, coluna) => (
                      <td key={coluna} className={celula === "●" ? styles.yes : celula === "–" ? styles.no : styles.text}>
                        {celula === "●" ? <span aria-label="incluído">●</span> : celula === "–" ? <span aria-label="não incluído">–</span> : celula}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th scope="row">Valor</th><td className={styles.text}>sob consulta</td><td className={styles.text}>sob consulta</td><td className={styles.text}>sob consulta</td></tr>
              </tfoot>
            </table>
          </div>
          {contact && <p className={styles.actions}><a href={contact} className={styles.cta} {...external}>Pedir os valores →</a></p>}
        </section>

        <section id="perguntas" className={`${styles.wrap} ${styles.section}`} aria-labelledby="perguntas-titulo">
          <p className={styles.sectionMark}>§ 5 · Perguntas e respostas</p>
          <h2 id="perguntas-titulo" className={styles.sectionTitle}>O que costuma ficar de fora da conversa.</h2>
          <dl className={styles.qa}>
            {perguntas.map(([pergunta, resposta]) => (
              <div key={pergunta}><dt>{pergunta}</dt><dd>{resposta}</dd></div>
            ))}
          </dl>
        </section>

        <section className={`${styles.wrap} ${styles.section} ${styles.closing}`} aria-label="Fechamento">
          <p className={styles.ps}><b>P.S.</b> Quem já usa o Coliseon entra por aqui: <Link href="/login" className={styles.textLink}>acessar o sistema →</Link></p>
          {contact && <p className={styles.actions}><a href={contact} className={styles.cta} {...external}>Falar com a gente →</a></p>}
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <span>Coliseon · PDV e gestão para loja de TCG</span>
          <nav aria-label="Rodapé"><a href="#carta">Carta</a><a href="#planos">Planos</a><a href="#perguntas">Perguntas</a><Link href="/login">Acessar</Link></nav>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}
