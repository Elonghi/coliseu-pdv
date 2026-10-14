const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function isSplittableSealedProduct(name: string, description?: string | null) {
  const text = normalize(`${name} ${description ?? ""}`);
  if (text.includes("booster avulso")) return false;
  return text.includes("booster box")
    || (text.includes("display") && text.includes("booster"))
    || text.includes("triple pack")
    || text.includes("elite trainer box")
    || (text.includes("bundle") && text.includes("booster"));
}
