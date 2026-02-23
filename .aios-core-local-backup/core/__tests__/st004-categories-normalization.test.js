const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadCategoryFns() {
  const file = path.resolve(__dirname, "../../../src/domain/categories.js");
  const source = fs.readFileSync(file, "utf8");

  const canonicalizeMatch = source.match(/export function canonicalizeCategory[\s\S]*?\n}\n/);
  const normalizeMatch = source.match(/export function normalizeCategory[\s\S]*?\n}\n/);
  if (!canonicalizeMatch || !normalizeMatch) {
    throw new Error("Could not locate category normalization functions in source.");
  }

  const script = `
    const DEFAULT_CATEGORY = "trabalho";
    ${canonicalizeMatch[0].replace("export ", "")}
    ${normalizeMatch[0].replace("export ", "")}
    module.exports = { canonicalizeCategory, normalizeCategory };
  `;

  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(script, sandbox);
  return sandbox.module.exports;
}

describe("ST-004 category normalization", () => {
  const { canonicalizeCategory, normalizeCategory } = loadCategoryFns();

  it("canonicalizes accented and noisy category names", () => {
    expect(canonicalizeCategory("  Sáude & Bem-estar  ")).toBe("saude-bem-estar");
    expect(canonicalizeCategory("Trabalho___")).toBe("trabalho");
  });

  it("uses default fallback ('trabalho') for empty/invalid legacy values", () => {
    expect(normalizeCategory()).toBe("trabalho");
    expect(normalizeCategory(null)).toBe("trabalho");
    expect(normalizeCategory("   ")).toBe("trabalho");
    expect(normalizeCategory("@@@")).toBe("trabalho");
  });

  it("accepts valid categories and supports custom fallback override", () => {
    expect(normalizeCategory("Estudo")).toBe("estudo");
    expect(normalizeCategory("saude")).toBe("saude");
    expect(normalizeCategory("", "saude")).toBe("saude");
  });
});
