import { describe, expect, it } from "vitest";
import { isSplittableSealedProduct } from "@/modules/catalog/classification";

describe("classificação de produtos selados", () => {
  it.each([
    ["Magic Play Booster Box", null],
    ["Display Pokémon", "Display lacrado com boosters"],
    ["Pokémon Triple Pack Blister", "Contém 3 boosters"],
    ["Elite Trainer Box", "Contém boosters e acessórios"],
    ["Magic Foundations Bundle", "Bundle com 9 Play Boosters"],
  ])("habilita %s para abertura", (name, description) => expect(isSplittableSealedProduct(name, description)).toBe(true));

  it.each([
    ["Magic Play Booster", "Booster avulso"],
    ["Deck Box para 100 cards", "Caixa para deck"],
    ["Refrigerante 2L", "Garrafa"],
  ])("não habilita %s", (name, description) => expect(isSplittableSealedProduct(name, description)).toBe(false));
});
