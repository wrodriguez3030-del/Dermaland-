import { writeFileSync } from "node:fs";
import { mockBrands, mockLaboratories, mockCategories, mockProducts } from "./catalog";

// Ejecutar con: pnpm --filter web exec tsx src/lib/mock-data/catalog-export.ts
const snapshot = {
  brands: mockBrands.map((b) => ({ mockId: b.id, name: b.name })),
  laboratories: mockLaboratories.map((l) => ({ mockId: l.id, name: l.name, country: l.country ?? null })),
  categories: mockCategories.map((c) => ({ mockId: c.id, name: c.name, description: c.description ?? null, parentMockId: c.parentId ?? null })),
  products: mockProducts.map((p) => ({
    sku: p.sku, barcode: p.barcode ?? null, name: p.name, description: p.description ?? null,
    brandMockId: p.brandId ?? null, laboratoryMockId: p.laboratoryId ?? null, categoryMockId: p.categoryId ?? null,
    unit: p.unit, pharmaceuticalForm: p.pharmaceuticalForm ?? null, presentation: p.presentation ?? null,
    activeIngredient: p.activeIngredient ?? null, concentration: p.concentration ?? null,
    sanitaryRegistry: p.sanitaryRegistry ?? null, storageTemperature: p.storageTemperature ?? null,
    requiresPrescription: p.requiresPrescription, controlled: p.controlled,
    cost: p.cost, price: p.price, itbisRate: p.itbisRate, minStock: p.minStock, maxStock: p.maxStock,
    imageUrl: p.imageUrl ?? null, active: p.active, sellable: p.sellable,
  })),
};
writeFileSync(new URL("./catalog-snapshot.json", import.meta.url), JSON.stringify(snapshot, null, 2));
console.log(`[catalog-export] brands=${snapshot.brands.length} labs=${snapshot.laboratories.length} cats=${snapshot.categories.length} products=${snapshot.products.length}`);
