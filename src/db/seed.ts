import "dotenv/config";
import { hash } from "bcryptjs";
import { pool } from "./index";
import { createSale } from "@/modules/sales/service";

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@coliseu.local").toLowerCase();
const operatorEmail = (process.env.SEED_OPERATOR_EMAIL ?? "operador@coliseu.local").toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "TroqueEstaSenha123!";
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD ?? "TroqueEstaSenha123!";

if (process.env.NODE_ENV === "production" && (
  adminPassword === "TroqueEstaSenha123!" || operatorPassword === "TroqueEstaSenha123!" ||
  adminPassword.length < 12 || operatorPassword.length < 12
)) {
  throw new Error("Defina senhas de seed com pelo menos 12 caracteres em produção.");
}

type Role = "ADMIN" | "OPERATOR";
type SeedProduct = {
  sku: string;
  name: string;
  description: string;
  category: string;
  unit: "UN" | "CX" | "PCT";
  costCents: number;
  priceCents: number;
  maxDiscountBps: number;
  stock: number;
  minimumStock: number;
};

async function upsertUser(name: string, email: string, password: string, role: Role) {
  const existing = await pool.query<{ id: string }>("SELECT id FROM users WHERE lower(email)=lower($1)", [email]);
  const passwordHash = await hash(password, 12);
  if (existing.rows[0]) {
    await pool.query("UPDATE users SET name=$1,role=$2,password_hash=$3,active=true,updated_at=now() WHERE id=$4", [name, role, passwordHash, existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const result = await pool.query<{ id: string }>("INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id", [name, email, passwordHash, role]);
  return result.rows[0].id;
}

async function ensureCategory(name: string) {
  const existing = await pool.query<{ id: string }>("SELECT id FROM categories WHERE lower(name)=lower($1)", [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query<{ id: string }>("INSERT INTO categories (name) VALUES ($1) RETURNING id", [name]);
  return inserted.rows[0].id;
}

async function main() {
  const adminId = await upsertUser("Administrador", adminEmail, adminPassword, "ADMIN");
  const operatorId = await upsertUser("Operador de Caixa", operatorEmail, operatorPassword, "OPERATOR");

  for (const [code, name, sort] of [["CASH", "Dinheiro", 0], ["PIX", "PIX", 1], ["DEBIT_CARD", "Cartão de débito", 2], ["CREDIT_CARD", "Cartão de crédito", 3], ["PLAYER_CREDIT", "Crédito do jogador", 4], ["FUTURE", "Pagamento futuro", 5]] as const) {
    await pool.query("INSERT INTO payment_methods (code,name,sort_order) VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order", [code, name, sort]);
  }

  const unitIds = new Map<string, string>();
  for (const [code, name] of [["UN", "Unidade"], ["CX", "Caixa"], ["PCT", "Pacote"]] as const) {
    const result = await pool.query<{ id: string }>("INSERT INTO units (code,name) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET name=excluded.name RETURNING id", [code, name]);
    unitIds.set(code, result.rows[0].id);
  }

  const categoryNames = ["Magic: The Gathering", "Pokémon TCG", "Acessórios TCG", "Bebidas", "Snacks"];
  const categoryIds = new Map<string, string>();
  for (const name of categoryNames) categoryIds.set(name, await ensureCategory(name));

  // Preços em centavos são demonstrativos para desenvolvimento; não representam preço oficial ou cotação de mercado.
  const products: SeedProduct[] = [
    { sku: "REF-001", name: "Refrigerante Coca-Cola 2L", description: "Garrafa de Coca-Cola tradicional com 2 litros.", category: "Bebidas", unit: "UN", costCents: 500, priceCents: 900, maxDiscountBps: 1000, stock: 50, minimumStock: 10 },
    { sku: "REF-002", name: "Refrigerante Coca-Cola lata 350ml", description: "Coca-Cola tradicional gelada em lata de 350ml.", category: "Bebidas", unit: "UN", costCents: 300, priceCents: 600, maxDiscountBps: 1000, stock: 72, minimumStock: 18 },
    { sku: "AGU-001", name: "Água mineral 500ml", description: "Água mineral sem gás em garrafa de 500ml.", category: "Bebidas", unit: "UN", costCents: 100, priceCents: 300, maxDiscountBps: 500, stock: 80, minimumStock: 15 },
    { sku: "ENE-001", name: "Energético lata 250ml", description: "Bebida energética em lata para consumo individual.", category: "Bebidas", unit: "UN", costCents: 650, priceCents: 1200, maxDiscountBps: 800, stock: 36, minimumStock: 8 },
    { sku: "SAL-001", name: "Salgadinho 100g", description: "Salgadinho para consumo durante partidas e eventos.", category: "Snacks", unit: "UN", costCents: 250, priceCents: 550, maxDiscountBps: 800, stock: 35, minimumStock: 8 },
    { sku: "CHO-001", name: "Chocolate ao leite 90g", description: "Barra de chocolate ao leite de 90g.", category: "Snacks", unit: "UN", costCents: 350, priceCents: 700, maxDiscountBps: 800, stock: 30, minimumStock: 6 },

    { sku: "MTG-FDN-BST", name: "Magic Foundations — Play Booster", description: "Booster avulso de Magic: The Gathering Foundations com 14 cards.", category: "Magic: The Gathering", unit: "PCT", costCents: 2800, priceCents: 4490, maxDiscountBps: 500, stock: 48, minimumStock: 12 },
    { sku: "MTG-FDN-BOX", name: "Magic Foundations — Play Booster Box (36)", description: "Display lacrado com 36 Play Boosters de Magic: The Gathering Foundations.", category: "Magic: The Gathering", unit: "CX", costCents: 110000, priceCents: 139990, maxDiscountBps: 500, stock: 6, minimumStock: 2 },
    { sku: "MTG-FDN-COL", name: "Magic Foundations — Collector Booster", description: "Collector Booster avulso de Foundations com cards especiais e tratamentos premium.", category: "Magic: The Gathering", unit: "PCT", costCents: 11500, priceCents: 15990, maxDiscountBps: 500, stock: 12, minimumStock: 3 },
    { sku: "MTG-FDN-BDL", name: "Magic Foundations — Bundle", description: "Bundle de Foundations com 9 Play Boosters, terrenos, marcador spindown e deck box.", category: "Magic: The Gathering", unit: "UN", costCents: 35000, priceCents: 44990, maxDiscountBps: 500, stock: 8, minimumStock: 2 },
    { sku: "MTG-FF-BOX", name: "Magic FINAL FANTASY — Play Booster Box (30)", description: "Box lacrada de Magic: The Gathering—FINAL FANTASY com 30 Play Boosters.", category: "Magic: The Gathering", unit: "CX", costCents: 145000, priceCents: 179990, maxDiscountBps: 300, stock: 4, minimumStock: 1 },
    { sku: "MTG-MH3-CMD", name: "Magic Modern Horizons 3 — Commander Deck Eldrazi Incursion", description: "Deck Commander pronto para jogar com 100 cards e Collector Booster Sample Pack.", category: "Magic: The Gathering", unit: "UN", costCents: 70000, priceCents: 89990, maxDiscountBps: 500, stock: 5, minimumStock: 1 },

    { sku: "PKM-TRP-001", name: "Pokémon TCG — Triple Pack Blister", description: "Triple pack com 3 boosters de Pokémon TCG e carta promocional.", category: "Pokémon TCG", unit: "UN", costCents: 9000, priceCents: 12990, maxDiscountBps: 500, stock: 16, minimumStock: 4 },
    { sku: "PKM-SSP-BST", name: "Pokémon Scarlet & Violet—Surging Sparks Booster", description: "Booster avulso da expansão Scarlet & Violet—Surging Sparks.", category: "Pokémon TCG", unit: "PCT", costCents: 1900, priceCents: 2990, maxDiscountBps: 500, stock: 48, minimumStock: 12 },
    { sku: "PKM-SSP-ETB", name: "Pokémon Surging Sparks — Elite Trainer Box", description: "Elite Trainer Box com boosters, sleeves, dados, marcadores e acessórios para jogo.", category: "Pokémon TCG", unit: "CX", costCents: 30000, priceCents: 39990, maxDiscountBps: 500, stock: 7, minimumStock: 2 },
    { sku: "PKM-CHAR-LBD", name: "Pokémon TCG — Charizard ex League Battle Deck", description: "League Battle Deck de Charizard ex pronto para jogar.", category: "Pokémon TCG", unit: "UN", costCents: 19000, priceCents: 24990, maxDiscountBps: 500, stock: 9, minimumStock: 2 },

    { sku: "ACC-SLV-100", name: "Sleeves premium pretos — 100 unidades", description: "Pacote com 100 protetores opacos para cards tamanho padrão.", category: "Acessórios TCG", unit: "PCT", costCents: 2500, priceCents: 4490, maxDiscountBps: 1000, stock: 30, minimumStock: 8 },
    { sku: "ACC-DECK-001", name: "Deck Box para 100 cards", description: "Caixa rígida para deck com espaço para até 100 cards com sleeves.", category: "Acessórios TCG", unit: "UN", costCents: 1500, priceCents: 2990, maxDiscountBps: 1000, stock: 25, minimumStock: 6 },
    { sku: "ACC-BIND-001", name: "Fichário TCG 9 bolsos", description: "Fichário com páginas de 9 bolsos para organizar e proteger a coleção.", category: "Acessórios TCG", unit: "UN", costCents: 4500, priceCents: 7990, maxDiscountBps: 1000, stock: 12, minimumStock: 3 },
  ];

  const productIds = new Map<string, string>();
  let insertedCount = 0;
  for (const product of products) {
    const existing = await pool.query<{ id: string }>("SELECT id FROM products WHERE sku=$1", [product.sku]);
    if (existing.rows[0]) {
      productIds.set(product.sku, existing.rows[0].id);
      continue;
    }
    const inserted = await pool.query<{ id: string }>(`INSERT INTO products
      (sku,name,description,category_id,unit_id,cost_cents,sale_price_cents,max_discount_bps,stock_quantity,minimum_stock)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [product.sku, product.name, product.description, categoryIds.get(product.category), unitIds.get(product.unit), product.costCents, product.priceCents, product.maxDiscountBps, product.stock, product.minimumStock]);
    const id = inserted.rows[0].id;
    productIds.set(product.sku, id);
    insertedCount++;
    await pool.query("INSERT INTO stock_movements (product_id,type,quantity_delta,previous_quantity,new_quantity,user_id,notes) VALUES ($1,'INITIAL',$2,0,$2,$3,'Estoque inicial do seed TCG')", [id, product.stock, adminId]);
  }

  const sales = await pool.query<{ count: string }>("SELECT count(*) FROM sales");
  if (Number(sales.rows[0].count) === 0) {
    await createSale({
      items: [
        { productId: productIds.get("REF-001")!, quantity: 2, discountBasisPoints: 500 },
        { productId: productIds.get("MTG-FDN-BST")!, quantity: 1, discountBasisPoints: 0 },
      ],
      payments: [{ methodCode: "PIX", amountAppliedCents: 6200 }],
    }, operatorId);
    await createSale({
      items: [
        { productId: productIds.get("AGU-001")!, quantity: 3, discountBasisPoints: 0 },
        { productId: productIds.get("SAL-001")!, quantity: 1, discountBasisPoints: 0 },
        { productId: productIds.get("PKM-TRP-001")!, quantity: 1, discountBasisPoints: 0 },
      ],
      payments: [
        { methodCode: "CASH", amountAppliedCents: 7000, amountReceivedCents: 10000 },
        { methodCode: "DEBIT_CARD", amountAppliedCents: 7440 },
      ],
    }, operatorId);
    await createSale({
      items: [{ productId: productIds.get("MTG-FDN-BOX")!, quantity: 1, discountBasisPoints: 0 }],
      payments: [{ methodCode: "CREDIT_CARD", amountAppliedCents: 139990 }],
    }, operatorId);
  }

  console.log(`Seed concluído: ${products.length} produtos de catálogo (${insertedCount} novos).`);
  console.log(`Admin: ${adminEmail} | Operador: ${operatorEmail}`);
}

try {
  await main();
} finally {
  await pool.end();
}
