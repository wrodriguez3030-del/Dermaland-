import type { Branch, Business, Warehouse } from "@/types";

export const mockBusiness: Business = {
  id: "biz_dermaland",
  legalName: "DermaLand SRL",
  commercialName: "DermaLand",
  rnc: "1-32-59077-5",
  country: "República Dominicana",
  phone: "+1 809-226-5252",
  whatsapp: "+1 809-226-5252",
  email: "dermalandrd@gmail.com",
  instagramUrl: "https://www.instagram.com/dermalandrd",
  // Eslogan y bio confirmados del perfil público de Instagram (@dermalandrd).
  slogan: "Venta de Productos Dermatológicos",
  description:
    "Venta de productos dermatológicos y dermocosmética en República Dominicana.",
  // Dirección fiscal/sede tomada de los datos ya existentes en el sistema
  // (emisor e-CF y sucursal piloto Santiago). NO proviene de Instagram.
  address: "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este",
  city: "Santiago de los Caballeros",
  province: "Santiago",
  // website: pendiente — no hay link verificable en la bio de Instagram.
  logoUrl: "/brand/dermaland-logo.svg",
  dgiiEnabled: false,
  planId: "plan_business",
  status: "active",
  createdAt: "2026-05-04T14:00:00Z",
  updatedAt: "2026-05-05T09:30:00Z",
};

export const mockBranches: Branch[] = [
  {
    id: "br_santiago",
    businessId: mockBusiness.id,
    code: "STG-01",
    name: "DermaLand Santiago",
    address: "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este",
    city: "Santiago de los Caballeros",
    province: "Santiago",
    country: "República Dominicana",
    phone: "+1 809-226-5252",
    whatsapp: "+1 809-226-5252",
    email: "santiago@dermaland.do",
    isPilot: true,
    showOnWebsite: true,
    status: "active",
    createdAt: "2026-05-04T14:00:00Z",
    updatedAt: "2026-05-04T14:00:00Z",
  },
  {
    id: "br_sd_naco",
    businessId: mockBusiness.id,
    code: "SD-01",
    name: "DermaLand Naco",
    address: "Av. Tiradentes 32, Naco",
    city: "Santo Domingo",
    province: "Distrito Nacional",
    country: "República Dominicana",
    phone: "+1 809-555-0102",
    whatsapp: "+1 809-555-0102",
    email: "naco@dermaland.do",
    isPilot: false,
    showOnWebsite: true,
    status: "active",
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-10T10:00:00Z",
  },
  {
    id: "br_sd_piantini",
    businessId: mockBusiness.id,
    code: "SD-02",
    name: "DermaLand Piantini",
    address: "Av. Roberto Pastoriza, Piantini",
    city: "Santo Domingo",
    province: "Distrito Nacional",
    country: "República Dominicana",
    phone: "+1 809-555-0103",
    whatsapp: "+1 809-555-0103",
    email: "piantini@dermaland.do",
    isPilot: false,
    showOnWebsite: false,
    status: "inactive",
    createdAt: "2026-05-12T10:00:00Z",
    updatedAt: "2026-05-12T10:00:00Z",
  },
];

export const mockWarehouses: Warehouse[] = [
  {
    id: "wh_stg_main",
    businessId: mockBusiness.id,
    branchId: "br_santiago",
    code: "STG-MAIN",
    name: "Almacén principal Santiago",
    description: "Almacén central de la sucursal piloto",
    isMain: true,
    createdAt: "2026-05-04T14:00:00Z",
    updatedAt: "2026-05-04T14:00:00Z",
  },
  {
    id: "wh_stg_floor",
    businessId: mockBusiness.id,
    branchId: "br_santiago",
    code: "STG-FLOOR",
    name: "Góndolas Santiago",
    description: "Góndolas y exhibición",
    isMain: false,
    createdAt: "2026-05-04T14:00:00Z",
    updatedAt: "2026-05-04T14:00:00Z",
  },
  {
    id: "wh_naco_main",
    businessId: mockBusiness.id,
    branchId: "br_sd_naco",
    code: "NACO-MAIN",
    name: "Almacén principal Naco",
    isMain: true,
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-05-10T10:00:00Z",
  },
];

export function getBranchById(id: string) {
  return mockBranches.find((b) => b.id === id);
}

export function getWarehouseById(id: string) {
  return mockWarehouses.find((w) => w.id === id);
}

export function getWarehousesByBranch(branchId: string) {
  return mockWarehouses.filter((w) => w.branchId === branchId);
}
