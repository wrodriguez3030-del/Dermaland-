/**
 * Tipos de la base de datos Supabase.
 *
 * Generables desde el CLI cuando exista el proyecto:
 *   pnpm dlx supabase gen types typescript --project-id <id> > src/server/db/database.types.ts
 *
 * Por ahora un esqueleto manual con las tablas de Fase 1 — se sobreescribe
 * automáticamente al correr el comando de arriba contra el proyecto real.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          legal_name: string;
          commercial_name: string;
          rnc: string;
          country: string;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          dgii_enabled: boolean;
          plan_id: string;
          status: "active" | "suspended" | "trial" | "past_due";
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          legal_name: string;
          commercial_name: string;
          rnc: string;
          country: string;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          dgii_enabled?: boolean;
          plan_id: string;
          status?: "active" | "suspended" | "trial" | "past_due";
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["businesses"]["Insert"]>;
      };
      branches: {
        Row: {
          id: string;
          business_id: string;
          code: string;
          name: string;
          address: string;
          city: string;
          province: string;
          country: string;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          status: "active" | "inactive";
          show_on_website: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["branches"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          sku: string;
          barcode: string | null;
          name: string;
          brand_id: string | null;
          category_id: string | null;
          unit: string;
          price: number;
          itbis_rate: number;
          min_stock: number;
          max_stock: number;
          requires_prescription: boolean;
          controlled: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["products"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      product_lots: {
        Row: {
          id: string;
          business_id: string;
          branch_id: string;
          product_id: string;
          warehouse_id: string;
          lot_number: string;
          expires_at: string;
          received_at: string;
          initial_quantity: number;
          current_quantity: number;
          unit_cost: number;
          status:
            | "available"
            | "quarantine"
            | "expired"
            | "recalled"
            | "damaged"
            | "returned";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["product_lots"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["product_lots"]["Insert"]>;
      };
      // Resto de tablas (clients, sales, payments, proformas, audit_logs,
      // inventory_counts, inventory_count_scans, etc.) siguen el mismo patrón.
      // Generar con `supabase gen types` cuando exista la DB.
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
