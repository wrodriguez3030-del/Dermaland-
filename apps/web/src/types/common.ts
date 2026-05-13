export type ID = string;

export interface Audited {
  createdAt: string;
  updatedAt: string;
  createdBy?: ID;
  updatedBy?: ID;
}

export interface SoftDeletable {
  deletedAt?: string | null;
}

export interface BusinessScoped {
  businessId: ID;
}

export interface BranchScoped extends BusinessScoped {
  branchId: ID;
}

export type Currency = "DOP" | "USD";
