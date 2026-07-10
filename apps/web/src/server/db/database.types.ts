export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          branch_id: string | null
          business_id: string
          created_at: string
          entity: string
          entity_id: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          branch_id?: string | null
          business_id: string
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          branch_id?: string | null
          business_id?: string
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string
          business_id: string
          city: string
          code: string
          country: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_pilot: boolean
          name: string
          phone: string | null
          province: string
          show_on_website: boolean
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address: string
          business_id: string
          city: string
          code: string
          country: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_pilot?: boolean
          name: string
          phone?: string | null
          province: string
          show_on_website?: boolean
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string
          business_id?: string
          city?: string
          code?: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_pilot?: boolean
          name?: string
          phone?: string | null
          province?: string
          show_on_website?: boolean
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          product_count: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          product_count?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          product_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          commercial_name: string
          country: string
          created_at: string
          deleted_at: string | null
          dgii_enabled: boolean
          email: string | null
          id: string
          instagram_url: string | null
          legal_name: string
          logo_url: string | null
          phone: string | null
          plan_id: string
          rnc: string
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          commercial_name: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          dgii_enabled?: boolean
          email?: string | null
          id?: string
          instagram_url?: string | null
          legal_name: string
          logo_url?: string | null
          phone?: string | null
          plan_id: string
          rnc: string
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          commercial_name?: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          dgii_enabled?: boolean
          email?: string | null
          id?: string
          instagram_url?: string | null
          legal_name?: string
          logo_url?: string | null
          phone?: string | null
          plan_id?: string
          rnc?: string
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closing_percentage_logs: {
        Row: {
          actual_amount_converted: number
          authorizer_name: string | null
          authorizer_user_id: string | null
          business_id: string
          cash_closing_id: string
          comment: string | null
          count_converted: number
          count_left_pending: number
          entered_at: string
          entered_by: string
          entered_by_name: string
          final_status: string
          id: string
          percentage_entered: number
          target_amount_calculated: number
          total_proformas_available: number
        }
        Insert: {
          actual_amount_converted: number
          authorizer_name?: string | null
          authorizer_user_id?: string | null
          business_id: string
          cash_closing_id: string
          comment?: string | null
          count_converted: number
          count_left_pending: number
          entered_at?: string
          entered_by: string
          entered_by_name: string
          final_status: string
          id?: string
          percentage_entered: number
          target_amount_calculated: number
          total_proformas_available: number
        }
        Update: {
          actual_amount_converted?: number
          authorizer_name?: string | null
          authorizer_user_id?: string | null
          business_id?: string
          cash_closing_id?: string
          comment?: string | null
          count_converted?: number
          count_left_pending?: number
          entered_at?: string
          entered_by?: string
          entered_by_name?: string
          final_status?: string
          id?: string
          percentage_entered?: number
          target_amount_calculated?: number
          total_proformas_available?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_closing_percentage_logs_authorizer_user_id_fkey"
            columns: ["authorizer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closing_percentage_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closing_percentage_logs_cash_closing_id_fkey"
            columns: ["cash_closing_id"]
            isOneToOne: false
            referencedRelation: "cash_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closing_percentage_logs_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closing_sales: {
        Row: {
          business_id: string
          cash_closing_id: string
          converted_to_ecf_at: string | null
          created_at: string
          electronic_invoice_id: string | null
          id: string
          proforma_id: string
          selected_for_ecf: boolean
          selection_method: string
        }
        Insert: {
          business_id: string
          cash_closing_id: string
          converted_to_ecf_at?: string | null
          created_at?: string
          electronic_invoice_id?: string | null
          id?: string
          proforma_id: string
          selected_for_ecf?: boolean
          selection_method?: string
        }
        Update: {
          business_id?: string
          cash_closing_id?: string
          converted_to_ecf_at?: string | null
          created_at?: string
          electronic_invoice_id?: string | null
          id?: string
          proforma_id?: string
          selected_for_ecf?: boolean
          selection_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_closing_sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closing_sales_cash_closing_id_fkey"
            columns: ["cash_closing_id"]
            isOneToOne: false
            referencedRelation: "cash_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closing_sales_electronic_invoice_fk"
            columns: ["electronic_invoice_id"]
            isOneToOne: false
            referencedRelation: "electronic_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closing_sales_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closings: {
        Row: {
          actual_amount_to_ecf: number
          applied_percentage: number
          authorizer_name: string | null
          authorizer_user_id: string | null
          branch_id: string
          business_id: string
          cash_register_session_id: string
          closing_at: string
          closing_by: string
          closing_by_name: string
          comment: string | null
          count_proformas_converted: number
          count_proformas_left_pending: number
          count_proformas_pending: number
          created_at: string
          id: string
          status: string
          target_amount_to_ecf: number
          total_card: number
          total_cash: number
          total_general: number
          total_other: number
          total_proformas_pending: number
          total_transfer: number
          updated_at: string
        }
        Insert: {
          actual_amount_to_ecf?: number
          applied_percentage?: number
          authorizer_name?: string | null
          authorizer_user_id?: string | null
          branch_id: string
          business_id: string
          cash_register_session_id: string
          closing_at?: string
          closing_by: string
          closing_by_name: string
          comment?: string | null
          count_proformas_converted?: number
          count_proformas_left_pending?: number
          count_proformas_pending?: number
          created_at?: string
          id?: string
          status?: string
          target_amount_to_ecf?: number
          total_card?: number
          total_cash?: number
          total_general?: number
          total_other?: number
          total_proformas_pending?: number
          total_transfer?: number
          updated_at?: string
        }
        Update: {
          actual_amount_to_ecf?: number
          applied_percentage?: number
          authorizer_name?: string | null
          authorizer_user_id?: string | null
          branch_id?: string
          business_id?: string
          cash_register_session_id?: string
          closing_at?: string
          closing_by?: string
          closing_by_name?: string
          comment?: string | null
          count_proformas_converted?: number
          count_proformas_left_pending?: number
          count_proformas_pending?: number
          created_at?: string
          id?: string
          status?: string
          target_amount_to_ecf?: number
          total_card?: number
          total_cash?: number
          total_general?: number
          total_other?: number
          total_proformas_pending?: number
          total_transfer?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_closings_authorizer_user_id_fkey"
            columns: ["authorizer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closings_cash_register_session_id_fkey"
            columns: ["cash_register_session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closings_closing_by_fkey"
            columns: ["closing_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_sessions: {
        Row: {
          branch_id: string
          business_id: string
          cash_register_id: string
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          difference_amount: number | null
          expected_cash: number
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opened_by_name: string
          opening_amount: number
          session_number: string
          status: string
          totals: Json
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          cash_register_id: string
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          difference_amount?: number | null
          expected_cash?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opened_by_name: string
          opening_amount?: number
          session_number: string
          status?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          cash_register_id?: string
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          difference_amount?: number | null
          expected_cash?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opened_by_name?: string
          opening_amount?: number
          session_number?: string
          status?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_sessions_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          branch_id: string
          business_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          birth_date: string | null
          business_id: string
          city: string | null
          consents: Json
          created_at: string
          customer_number: string
          default_billing_type: string
          deleted_at: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          last_visit_at: string | null
          notes: string | null
          phone: string | null
          province: string | null
          skin_type: string
          source: string
          tags: string[]
          total_orders: number
          total_spent: number
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          business_id: string
          city?: string | null
          consents?: Json
          created_at?: string
          customer_number: string
          default_billing_type?: string
          deleted_at?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          last_visit_at?: string | null
          notes?: string | null
          phone?: string | null
          province?: string | null
          skin_type?: string
          source?: string
          tags?: string[]
          total_orders?: number
          total_spent?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          business_id?: string
          city?: string | null
          consents?: Json
          created_at?: string
          customer_number?: string
          default_billing_type?: string
          deleted_at?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          last_visit_at?: string | null
          notes?: string | null
          phone?: string | null
          province?: string | null
          skin_type?: string
          source?: string
          tags?: string[]
          total_orders?: number
          total_spent?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dgii_certificates: {
        Row: {
          alias: string
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          issuer_dn: string | null
          iv: string | null
          kdf: string | null
          password_secret_ref: string
          pkcs12_encrypted_blob: string | null
          pkcs12_storage_bucket: string | null
          pkcs12_storage_path: string | null
          revoked_at: string | null
          serial_number: string | null
          subject_dn: string | null
          tag: string | null
          updated_at: string
          uploaded_by: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          alias: string
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          issuer_dn?: string | null
          iv?: string | null
          kdf?: string | null
          password_secret_ref: string
          pkcs12_encrypted_blob?: string | null
          pkcs12_storage_bucket?: string | null
          pkcs12_storage_path?: string | null
          revoked_at?: string | null
          serial_number?: string | null
          subject_dn?: string | null
          tag?: string | null
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          alias?: string
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          issuer_dn?: string | null
          iv?: string | null
          kdf?: string | null
          password_secret_ref?: string
          pkcs12_encrypted_blob?: string | null
          pkcs12_storage_bucket?: string | null
          pkcs12_storage_path?: string | null
          revoked_at?: string | null
          serial_number?: string | null
          subject_dn?: string | null
          tag?: string | null
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dgii_certificates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgii_certificates_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dgii_commercial_approvals: {
        Row: {
          business_id: string
          decided_at: string
          decided_by: string
          decided_by_name: string
          decision: string
          id: string
          reason: string | null
          received_ecf_id: string
          response_sent_at: string | null
          response_track_id: string | null
          xml_path: string | null
        }
        Insert: {
          business_id: string
          decided_at?: string
          decided_by: string
          decided_by_name: string
          decision: string
          id?: string
          reason?: string | null
          received_ecf_id: string
          response_sent_at?: string | null
          response_track_id?: string | null
          xml_path?: string | null
        }
        Update: {
          business_id?: string
          decided_at?: string
          decided_by?: string
          decided_by_name?: string
          decision?: string
          id?: string
          reason?: string | null
          received_ecf_id?: string
          response_sent_at?: string | null
          response_track_id?: string | null
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dgii_commercial_approvals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgii_commercial_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgii_commercial_approvals_received_ecf_id_fkey"
            columns: ["received_ecf_id"]
            isOneToOne: false
            referencedRelation: "dgii_received_ecf"
            referencedColumns: ["id"]
          },
        ]
      }
      dgii_received_ecf: {
        Row: {
          business_id: string
          commercial_approval_status: string
          e_ncf: string
          id: string
          processed_at: string | null
          razon_social_emisor: string | null
          received_at: string
          rnc_emisor_sender: string
          tipo_ecf: string
          total: number
          xml_path: string
        }
        Insert: {
          business_id: string
          commercial_approval_status?: string
          e_ncf: string
          id?: string
          processed_at?: string | null
          razon_social_emisor?: string | null
          received_at?: string
          rnc_emisor_sender: string
          tipo_ecf: string
          total?: number
          xml_path: string
        }
        Update: {
          business_id?: string
          commercial_approval_status?: string
          e_ncf?: string
          id?: string
          processed_at?: string | null
          razon_social_emisor?: string | null
          received_at?: string
          rnc_emisor_sender?: string
          tipo_ecf?: string
          total?: number
          xml_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgii_received_ecf_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dgii_settings: {
        Row: {
          actividad_economica: string | null
          allow_user_change_closing_percentage: boolean
          ambiente: string
          applies_to_payment_methods: string[]
          auto_generate_ecf_on_cash_closing: boolean
          base_url_certecf: string
          base_url_ecf: string
          base_url_testecf: string
          business_id: string
          correo_emisor: string | null
          created_at: string
          default_cash_closing_ecf_percentage: number
          dgii_enabled_real_send: boolean
          direccion_emisor: string
          id: string
          maximum_closing_ecf_percentage: number
          minimum_closing_ecf_percentage: number
          municipio: string | null
          nombre_comercial: string | null
          provincia: string | null
          razon_social_emisor: string
          require_admin_authorization_below_100_percent: boolean
          rnc_emisor: string
          telefono_emisor: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          actividad_economica?: string | null
          allow_user_change_closing_percentage?: boolean
          ambiente?: string
          applies_to_payment_methods?: string[]
          auto_generate_ecf_on_cash_closing?: boolean
          base_url_certecf?: string
          base_url_ecf?: string
          base_url_testecf?: string
          business_id: string
          correo_emisor?: string | null
          created_at?: string
          default_cash_closing_ecf_percentage?: number
          dgii_enabled_real_send?: boolean
          direccion_emisor: string
          id?: string
          maximum_closing_ecf_percentage?: number
          minimum_closing_ecf_percentage?: number
          municipio?: string | null
          nombre_comercial?: string | null
          provincia?: string | null
          razon_social_emisor: string
          require_admin_authorization_below_100_percent?: boolean
          rnc_emisor: string
          telefono_emisor?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          actividad_economica?: string | null
          allow_user_change_closing_percentage?: boolean
          ambiente?: string
          applies_to_payment_methods?: string[]
          auto_generate_ecf_on_cash_closing?: boolean
          base_url_certecf?: string
          base_url_ecf?: string
          base_url_testecf?: string
          business_id?: string
          correo_emisor?: string | null
          created_at?: string
          default_cash_closing_ecf_percentage?: number
          dgii_enabled_real_send?: boolean
          direccion_emisor?: string
          id?: string
          maximum_closing_ecf_percentage?: number
          minimum_closing_ecf_percentage?: number
          municipio?: string | null
          nombre_comercial?: string | null
          provincia?: string | null
          razon_social_emisor?: string
          require_admin_authorization_below_100_percent?: boolean
          rnc_emisor?: string
          telefono_emisor?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dgii_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      dgii_status_logs: {
        Row: {
          business_id: string
          consulted_at: string
          electronic_invoice_id: string
          id: string
          response_body_path: string | null
          response_code: string | null
          response_message: string | null
          response_status: number | null
          track_id: string
        }
        Insert: {
          business_id: string
          consulted_at?: string
          electronic_invoice_id: string
          id?: string
          response_body_path?: string | null
          response_code?: string | null
          response_message?: string | null
          response_status?: number | null
          track_id: string
        }
        Update: {
          business_id?: string
          consulted_at?: string
          electronic_invoice_id?: string
          id?: string
          response_body_path?: string | null
          response_code?: string | null
          response_message?: string | null
          response_status?: number | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgii_status_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgii_status_logs_electronic_invoice_id_fkey"
            columns: ["electronic_invoice_id"]
            isOneToOne: false
            referencedRelation: "electronic_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      dgii_submissions: {
        Row: {
          attempt_no: number
          business_id: string
          electronic_invoice_id: string
          endpoint_url: string
          error_code: string | null
          error_message: string | null
          id: string
          request_body_path: string | null
          request_headers: Json | null
          responded_at: string | null
          response_body_path: string | null
          response_status: number | null
          sent_at: string
          track_id: string | null
        }
        Insert: {
          attempt_no?: number
          business_id: string
          electronic_invoice_id: string
          endpoint_url: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          request_body_path?: string | null
          request_headers?: Json | null
          responded_at?: string | null
          response_body_path?: string | null
          response_status?: number | null
          sent_at?: string
          track_id?: string | null
        }
        Update: {
          attempt_no?: number
          business_id?: string
          electronic_invoice_id?: string
          endpoint_url?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          request_body_path?: string | null
          request_headers?: Json | null
          responded_at?: string | null
          response_body_path?: string | null
          response_status?: number | null
          sent_at?: string
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dgii_submissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgii_submissions_electronic_invoice_id_fkey"
            columns: ["electronic_invoice_id"]
            isOneToOne: false
            referencedRelation: "electronic_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_incentive_rules: {
        Row: {
          active: boolean
          business_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string | null
          fixed_amount: number | null
          id: string
          laboratory_id: string | null
          min_sales_amount: number | null
          name: string
          note: string | null
          percentage: number | null
          product_id: string | null
          rule_type: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          fixed_amount?: number | null
          id?: string
          laboratory_id?: string | null
          min_sales_amount?: number | null
          name: string
          note?: string | null
          percentage?: number | null
          product_id?: string | null
          rule_type: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          fixed_amount?: number | null
          id?: string
          laboratory_id?: string | null
          min_sales_amount?: number | null
          name?: string
          note?: string | null
          percentage?: number | null
          product_id?: string | null
          rule_type?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_incentives: {
        Row: {
          adjustment_amount: number
          approved_at: string | null
          base_amount: number
          business_id: string
          created_at: string
          earned_at: string
          id: string
          incentive_amount: number
          note: string | null
          paid_at: string | null
          payment_batch_id: string | null
          payment_method_group: string | null
          product_id: string | null
          rule_id: string | null
          rule_name: string | null
          rule_type: string | null
          sale_id: string
          seller_id: string | null
          seller_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          adjustment_amount?: number
          approved_at?: string | null
          base_amount?: number
          business_id: string
          created_at?: string
          earned_at?: string
          id?: string
          incentive_amount?: number
          note?: string | null
          paid_at?: string | null
          payment_batch_id?: string | null
          payment_method_group?: string | null
          product_id?: string | null
          rule_id?: string | null
          rule_name?: string | null
          rule_type?: string | null
          sale_id: string
          seller_id?: string | null
          seller_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          approved_at?: string | null
          base_amount?: number
          business_id?: string
          created_at?: string
          earned_at?: string
          id?: string
          incentive_amount?: number
          note?: string | null
          paid_at?: string | null
          payment_batch_id?: string | null
          payment_method_group?: string | null
          product_id?: string | null
          rule_id?: string | null
          rule_name?: string | null
          rule_type?: string | null
          sale_id?: string
          seller_id?: string | null
          seller_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_numberings: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_type: string
          end_date: string | null
          environment: string
          id: string
          is_electronic: boolean
          is_preferred: boolean
          name: string
          next_number: number
          note: string | null
          prefix: string
          range_end: number
          range_start: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type: string
          end_date?: string | null
          environment?: string
          id?: string
          is_electronic?: boolean
          is_preferred?: boolean
          name: string
          next_number: number
          note?: string | null
          prefix: string
          range_end: number
          range_start: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type?: string
          end_date?: string | null
          environment?: string
          id?: string
          is_electronic?: boolean
          is_preferred?: boolean
          name?: string
          next_number?: number
          note?: string | null
          prefix?: string
          range_end?: number
          range_start?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_numberings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ecf_sequences: {
        Row: {
          ambiente: string
          business_id: string
          created_at: string
          fecha_vencimiento: string
          id: string
          next_number: number
          prefix: string
          range_end: number
          range_start: number
          status: string
          tipo_ecf: string
          updated_at: string
        }
        Insert: {
          ambiente: string
          business_id: string
          created_at?: string
          fecha_vencimiento: string
          id?: string
          next_number: number
          prefix: string
          range_end: number
          range_start: number
          status?: string
          tipo_ecf: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          business_id?: string
          created_at?: string
          fecha_vencimiento?: string
          id?: string
          next_number?: number
          prefix?: string
          range_end?: number
          range_start?: number
          status?: string
          tipo_ecf?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecf_sequences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      electronic_invoice_items: {
        Row: {
          business_id: string
          created_at: string
          description_item: string | null
          discount_amount: number
          electronic_invoice_id: string
          id: string
          indicador_facturacion: string | null
          itbis_rate: number
          kind: string
          line_no: number
          monto_item: number
          name_item: string
          product_id: string | null
          product_sku: string | null
          quantity: number
          unit_measure: string | null
          unit_price: number
        }
        Insert: {
          business_id: string
          created_at?: string
          description_item?: string | null
          discount_amount?: number
          electronic_invoice_id: string
          id?: string
          indicador_facturacion?: string | null
          itbis_rate?: number
          kind?: string
          line_no: number
          monto_item: number
          name_item: string
          product_id?: string | null
          product_sku?: string | null
          quantity: number
          unit_measure?: string | null
          unit_price: number
        }
        Update: {
          business_id?: string
          created_at?: string
          description_item?: string | null
          discount_amount?: number
          electronic_invoice_id?: string
          id?: string
          indicador_facturacion?: string | null
          itbis_rate?: number
          kind?: string
          line_no?: number
          monto_item?: number
          name_item?: string
          product_id?: string | null
          product_sku?: string | null
          quantity?: number
          unit_measure?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "electronic_invoice_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoice_items_electronic_invoice_id_fkey"
            columns: ["electronic_invoice_id"]
            isOneToOne: false
            referencedRelation: "electronic_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      electronic_invoices: {
        Row: {
          accepted_at: string | null
          ambiente: string
          branch_id: string | null
          business_id: string
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          customer_rnc: string | null
          dgii_status_code: string | null
          dgii_status_message: string | null
          e_ncf: string
          generated_at: string | null
          generated_by: string | null
          hash_sha256: string | null
          id: string
          pdf_path: string | null
          proforma_id: string | null
          qr_code_payload: string | null
          rejected_at: string | null
          secuencia_id: string | null
          security_code: string | null
          sent_at: string | null
          sent_by: string | null
          signed_at: string | null
          source_invoice_id: string | null
          status: string
          subtotal_exento: number
          subtotal_gravado: number
          tipo_ecf: string
          total: number
          total_itbis: number
          total_otros_impuestos: number
          track_id: string | null
          updated_at: string
          xml_generated_path: string | null
          xml_response_path: string | null
          xml_signed_path: string | null
        }
        Insert: {
          accepted_at?: string | null
          ambiente: string
          branch_id?: string | null
          business_id: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_rnc?: string | null
          dgii_status_code?: string | null
          dgii_status_message?: string | null
          e_ncf: string
          generated_at?: string | null
          generated_by?: string | null
          hash_sha256?: string | null
          id?: string
          pdf_path?: string | null
          proforma_id?: string | null
          qr_code_payload?: string | null
          rejected_at?: string | null
          secuencia_id?: string | null
          security_code?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signed_at?: string | null
          source_invoice_id?: string | null
          status?: string
          subtotal_exento?: number
          subtotal_gravado?: number
          tipo_ecf: string
          total: number
          total_itbis?: number
          total_otros_impuestos?: number
          track_id?: string | null
          updated_at?: string
          xml_generated_path?: string | null
          xml_response_path?: string | null
          xml_signed_path?: string | null
        }
        Update: {
          accepted_at?: string | null
          ambiente?: string
          branch_id?: string | null
          business_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_rnc?: string | null
          dgii_status_code?: string | null
          dgii_status_message?: string | null
          e_ncf?: string
          generated_at?: string | null
          generated_by?: string | null
          hash_sha256?: string | null
          id?: string
          pdf_path?: string | null
          proforma_id?: string | null
          qr_code_payload?: string | null
          rejected_at?: string | null
          secuencia_id?: string | null
          security_code?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signed_at?: string | null
          source_invoice_id?: string | null
          status?: string
          subtotal_exento?: number
          subtotal_gravado?: number
          tipo_ecf?: string
          total?: number
          total_itbis?: number
          total_otros_impuestos?: number
          track_id?: string | null
          updated_at?: string
          xml_generated_path?: string | null
          xml_response_path?: string | null
          xml_signed_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "electronic_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoices_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoices_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoices_secuencia_id_fkey"
            columns: ["secuencia_id"]
            isOneToOne: false
            referencedRelation: "ecf_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electronic_invoices_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_evidence: {
        Row: {
          business_id: string
          created_at: string
          file_type: string
          file_url: string
          id: string
          inventory_count_id: string
          inventory_count_item_id: string | null
          notes: string | null
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          file_type: string
          file_url: string
          id?: string
          inventory_count_id: string
          inventory_count_item_id?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          file_type?: string
          file_url?: string
          id?: string
          inventory_count_id?: string
          inventory_count_item_id?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_evidence_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_evidence_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_evidence_inventory_count_item_id_fkey"
            columns: ["inventory_count_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          business_id: string
          counted_quantity: number
          created_at: string
          difference_quantity: number | null
          expected_quantity: number
          expires_at: string | null
          id: string
          inventory_count_id: string
          last_scan_at: string | null
          lot_number: string | null
          product_id: string
          product_lot_id: string | null
          product_name: string
          product_sku: string
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          business_id: string
          counted_quantity?: number
          created_at?: string
          difference_quantity?: number | null
          expected_quantity: number
          expires_at?: string | null
          id?: string
          inventory_count_id: string
          last_scan_at?: string | null
          lot_number?: string | null
          product_id: string
          product_lot_id?: string | null
          product_name: string
          product_sku: string
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          business_id?: string
          counted_quantity?: number
          created_at?: string
          difference_quantity?: number | null
          expected_quantity?: number
          expires_at?: string | null
          id?: string
          inventory_count_id?: string
          last_scan_at?: string | null
          lot_number?: string | null
          product_id?: string
          product_lot_id?: string | null
          product_name?: string
          product_sku?: string
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_scans: {
        Row: {
          barcode: string | null
          branch_id: string
          business_id: string
          created_at: string
          device_id: string
          id: string
          inventory_count_id: string
          notes: string | null
          offline_scan_id: string
          product_id: string
          product_lot_id: string | null
          scan_source: string
          scanned_at: string
          scanned_by: string | null
          scanned_by_name: string | null
          scanned_quantity: number
          sync_status: string
          warehouse_id: string
          warehouse_location_id: string | null
        }
        Insert: {
          barcode?: string | null
          branch_id: string
          business_id: string
          created_at?: string
          device_id: string
          id?: string
          inventory_count_id: string
          notes?: string | null
          offline_scan_id: string
          product_id: string
          product_lot_id?: string | null
          scan_source: string
          scanned_at?: string
          scanned_by?: string | null
          scanned_by_name?: string | null
          scanned_quantity?: number
          sync_status?: string
          warehouse_id: string
          warehouse_location_id?: string | null
        }
        Update: {
          barcode?: string | null
          branch_id?: string
          business_id?: string
          created_at?: string
          device_id?: string
          id?: string
          inventory_count_id?: string
          notes?: string | null
          offline_scan_id?: string
          product_id?: string
          product_lot_id?: string | null
          scan_source?: string
          scanned_at?: string
          scanned_by?: string | null
          scanned_by_name?: string | null
          scanned_quantity?: number
          sync_status?: string
          warehouse_id?: string
          warehouse_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_scans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_scans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_scans_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_scans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_scans_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_count_scans_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_scans_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_scans_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_sync_logs: {
        Row: {
          business_id: string
          conflict_detected: boolean
          created_at: string
          device_id: string
          error_message: string | null
          id: string
          inventory_count_id: string
          request_payload: Json | null
          response_payload: Json | null
          sync_status: string
          synced_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          conflict_detected?: boolean
          created_at?: string
          device_id: string
          error_message?: string | null
          id?: string
          inventory_count_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          sync_status: string
          synced_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          conflict_detected?: boolean
          created_at?: string
          device_id?: string
          error_message?: string | null
          id?: string
          inventory_count_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          sync_status?: string
          synced_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_sync_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_sync_logs_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_sync_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string[]
          branch_id: string
          business_id: string
          cancelled_at: string | null
          count_number: string
          count_type: string
          created_at: string
          id: string
          item_count: number
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scan_count: number
          started_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string[]
          branch_id: string
          business_id: string
          cancelled_at?: string | null
          count_number: string
          count_type: string
          created_at?: string
          id?: string
          item_count?: number
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_count?: number
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string[]
          branch_id?: string
          business_id?: string
          cancelled_at?: string | null
          count_number?: string
          count_type?: string
          created_at?: string
          id?: string
          item_count?: number
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_count?: number
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          id: string
          lot_id: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference: string | null
          type: string
          user_id: string | null
          user_name: string | null
          warehouse_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          id?: string
          lot_id?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
          type: string
          user_id?: string | null
          user_name?: string | null
          warehouse_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          id?: string
          lot_id?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
          type?: string
          user_id?: string | null
          user_name?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratories: {
        Row: {
          business_id: string
          country: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          country?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laboratories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_quarantine: {
        Row: {
          business_id: string
          created_at: string
          id: string
          product_lot_id: string
          reason: string
          released_at: string | null
          released_by: string | null
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          product_lot_id: string
          reason: string
          released_at?: string | null
          released_by?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          product_lot_id?: string
          reason?: string
          released_at?: string | null
          released_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_quarantine_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_quarantine_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "lot_quarantine_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_quarantine_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_quarantine_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_recalls: {
        Row: {
          business_id: string
          created_at: string
          customers_notified: number
          id: string
          initiated_by: string | null
          product_lot_id: string
          reason: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customers_notified?: number
          id?: string
          initiated_by?: string | null
          product_lot_id: string
          reason: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customers_notified?: number
          id?: string
          initiated_by?: string | null
          product_lot_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_recalls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_recalls_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_recalls_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "lot_recalls_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          business_id: string
          code: string
          created_at: string
          default_ecf_type: string | null
          id: string
          is_active: boolean
          label: string
          requires_immediate_ecf: boolean
          updated_at: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          default_ecf_type?: string | null
          id?: string
          is_active?: boolean
          label: string
          requires_immediate_ecf?: boolean
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          default_ecf_type?: string | null
          id?: string
          is_active?: boolean
          label?: string
          requires_immediate_ecf?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          is_destructive: boolean
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          is_destructive?: boolean
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          is_destructive?: boolean
          module?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          features: Json
          highlight: boolean
          id: string
          limits: Json
          monthly_price_usd: number
          name: string
        }
        Insert: {
          created_at?: string
          features?: Json
          highlight?: boolean
          id?: string
          limits?: Json
          monthly_price_usd: number
          name: string
        }
        Update: {
          created_at?: string
          features?: Json
          highlight?: boolean
          id?: string
          limits?: Json
          monthly_price_usd?: number
          name?: string
        }
        Relationships: []
      }
      platform_users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          two_factor_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          current_quantity: number
          expires_at: string
          id: string
          initial_quantity: number
          lot_number: string
          manufactured_at: string | null
          notes: string | null
          product_id: string
          purchase_invoice: string | null
          received_at: string
          status: string
          supplier_id: string | null
          unit_cost: number
          unit_price: number | null
          updated_at: string
          warehouse_id: string
          warehouse_location_id: string | null
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          current_quantity: number
          expires_at: string
          id?: string
          initial_quantity: number
          lot_number: string
          manufactured_at?: string | null
          notes?: string | null
          product_id: string
          purchase_invoice?: string | null
          received_at?: string
          status?: string
          supplier_id?: string | null
          unit_cost: number
          unit_price?: number | null
          updated_at?: string
          warehouse_id: string
          warehouse_location_id?: string | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          current_quantity?: number
          expires_at?: string
          id?: string
          initial_quantity?: number
          lot_number?: string
          manufactured_at?: string | null
          notes?: string | null
          product_id?: string
          purchase_invoice?: string | null
          received_at?: string
          status?: string
          supplier_id?: string | null
          unit_cost?: number
          unit_price?: number | null
          updated_at?: string
          warehouse_id?: string
          warehouse_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          active_ingredient: string | null
          barcode: string | null
          brand_id: string | null
          business_id: string
          category_id: string | null
          concentration: string | null
          controlled: boolean
          cost: number
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          itbis_rate: number
          laboratory_id: string | null
          max_stock: number
          min_stock: number
          name: string
          pharmaceutical_form: string | null
          presentation: string | null
          price: number
          requires_prescription: boolean
          sanitary_registry: string | null
          sellable: boolean
          sku: string
          storage_temperature: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_ingredient?: string | null
          barcode?: string | null
          brand_id?: string | null
          business_id: string
          category_id?: string | null
          concentration?: string | null
          controlled?: boolean
          cost?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          itbis_rate?: number
          laboratory_id?: string | null
          max_stock?: number
          min_stock?: number
          name: string
          pharmaceutical_form?: string | null
          presentation?: string | null
          price: number
          requires_prescription?: boolean
          sanitary_registry?: string | null
          sellable?: boolean
          sku: string
          storage_temperature?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_ingredient?: string | null
          barcode?: string | null
          brand_id?: string | null
          business_id?: string
          category_id?: string | null
          concentration?: string | null
          controlled?: boolean
          cost?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          itbis_rate?: number
          laboratory_id?: string | null
          max_stock?: number
          min_stock?: number
          name?: string
          pharmaceutical_form?: string | null
          presentation?: string | null
          price?: number
          requires_prescription?: boolean
          sanitary_registry?: string | null
          sellable?: boolean
          sku?: string
          storage_temperature?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_laboratory_id_fkey"
            columns: ["laboratory_id"]
            isOneToOne: false
            referencedRelation: "laboratories"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_items: {
        Row: {
          business_id: string
          created_at: string
          discount: number
          id: string
          indicador_facturacion: string | null
          itbis: number
          itbis_rate: number
          kind: string
          line_no: number
          lot_number: string | null
          product_id: string | null
          product_lot_id: string | null
          product_name: string
          product_sku: string
          proforma_id: string
          quantity: number
          subtotal: number
          total: number
          unit_price: number
        }
        Insert: {
          business_id: string
          created_at?: string
          discount?: number
          id?: string
          indicador_facturacion?: string | null
          itbis?: number
          itbis_rate?: number
          kind?: string
          line_no: number
          lot_number?: string | null
          product_id?: string | null
          product_lot_id?: string | null
          product_name: string
          product_sku: string
          proforma_id: string
          quantity: number
          subtotal: number
          total: number
          unit_price: number
        }
        Update: {
          business_id?: string
          created_at?: string
          discount?: number
          id?: string
          indicador_facturacion?: string | null
          itbis?: number
          itbis_rate?: number
          kind?: string
          line_no?: number
          lot_number?: string | null
          product_id?: string | null
          product_lot_id?: string | null
          product_name?: string
          product_sku?: string
          proforma_id?: string
          quantity?: number
          subtotal?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_items_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "proforma_items_product_lot_id_fkey"
            columns: ["product_lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_items_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          method_code: string
          payment_method_id: string | null
          proforma_id: string
          reference: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          method_code: string
          payment_method_id?: string | null
          proforma_id: string
          reference?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          method_code?: string
          payment_method_id?: string | null
          proforma_id?: string
          reference?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_payments_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_to_ecf_logs: {
        Row: {
          business_id: string
          cash_closing_id: string | null
          created_at: string
          electronic_invoice_id: string
          id: string
          proforma_id: string
          reason: string | null
          triggered_by: string
          triggered_by_name: string
        }
        Insert: {
          business_id: string
          cash_closing_id?: string | null
          created_at?: string
          electronic_invoice_id: string
          id?: string
          proforma_id: string
          reason?: string | null
          triggered_by: string
          triggered_by_name: string
        }
        Update: {
          business_id?: string
          cash_closing_id?: string | null
          created_at?: string
          electronic_invoice_id?: string
          id?: string
          proforma_id?: string
          reason?: string | null
          triggered_by?: string
          triggered_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_to_ecf_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_to_ecf_logs_cash_closing_id_fkey"
            columns: ["cash_closing_id"]
            isOneToOne: false
            referencedRelation: "cash_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_to_ecf_logs_electronic_invoice_fk"
            columns: ["electronic_invoice_id"]
            isOneToOne: false
            referencedRelation: "electronic_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_to_ecf_logs_proforma_id_fkey"
            columns: ["proforma_id"]
            isOneToOne: false
            referencedRelation: "proformas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_to_ecf_logs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          amount_received: number | null
          balance: number
          billing_type: string | null
          branch_id: string
          business_id: string
          cash_register_session_id: string | null
          cashier_id: string
          cashier_name: string
          change_amount: number | null
          created_at: string
          customer_document: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount: number
          discount_amount: number | null
          discount_percent: number | null
          document_kind: string
          ecf_number: string | null
          ecf_type: string | null
          electronic_invoice_id: string | null
          id: string
          itbis: number
          notes: string | null
          number: string
          paid: number
          sequence_type: string | null
          numbering_id: string | null
          sequence_environment: string | null
          seller_id: string | null
          seller_name: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_received?: number | null
          balance?: number
          billing_type?: string | null
          branch_id: string
          business_id: string
          cash_register_session_id?: string | null
          cashier_id: string
          cashier_name: string
          change_amount?: number | null
          created_at?: string
          customer_document?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          discount?: number
          discount_amount?: number | null
          discount_percent?: number | null
          document_kind?: string
          ecf_number?: string | null
          ecf_type?: string | null
          electronic_invoice_id?: string | null
          id?: string
          itbis?: number
          notes?: string | null
          number: string
          paid?: number
          sequence_type?: string | null
          numbering_id?: string | null
          sequence_environment?: string | null
          seller_id?: string | null
          seller_name?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_received?: number | null
          balance?: number
          billing_type?: string | null
          branch_id?: string
          business_id?: string
          cash_register_session_id?: string | null
          cashier_id?: string
          cashier_name?: string
          change_amount?: number | null
          created_at?: string
          customer_document?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount?: number
          discount_amount?: number | null
          discount_percent?: number | null
          document_kind?: string
          ecf_number?: string | null
          ecf_type?: string | null
          electronic_invoice_id?: string | null
          id?: string
          itbis?: number
          notes?: string | null
          number?: string
          paid?: number
          sequence_type?: string | null
          numbering_id?: string | null
          sequence_environment?: string | null
          seller_id?: string | null
          seller_name?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proformas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_cash_register_session_id_fkey"
            columns: ["cash_register_session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_electronic_invoice_fk"
            columns: ["electronic_invoice_id"]
            isOneToOne: false
            referencedRelation: "electronic_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          granted_at: string
          permission_code: string
          role_code: string
        }
        Insert: {
          granted_at?: string
          permission_code: string
          role_code: string
        }
        Update: {
          granted_at?: string
          permission_code?: string
          role_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          label?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_color: string
          branch_ids: string[]
          business_id: string
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          phone: string | null
          role: string
          status: string
          two_factor_enabled: boolean
          updated_at: string
        }
        Insert: {
          avatar_color?: string
          branch_ids?: string[]
          business_id: string
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name: string
          id: string
          last_login_at?: string | null
          phone?: string | null
          role?: string
          status?: string
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Update: {
          avatar_color?: string
          branch_ids?: string[]
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          last_login_at?: string | null
          phone?: string | null
          role?: string
          status?: string
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          branch_id: string
          business_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_main: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_main?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_main?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_stock_by_lot: {
        Row: {
          branch_id: string | null
          business_id: string | null
          expires_at: string | null
          lot_id: string | null
          lot_number: string | null
          product_id: string | null
          quantity: number | null
          status: string | null
          warehouse_id: string | null
        }
        Insert: {
          branch_id?: string | null
          business_id?: string | null
          expires_at?: string | null
          lot_id?: string | null
          lot_number?: string | null
          product_id?: string | null
          quantity?: number | null
          status?: string | null
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string | null
          business_id?: string | null
          expires_at?: string | null
          lot_id?: string | null
          lot_number?: string | null
          product_id?: string | null
          quantity?: number | null
          status?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_business_id: { Args: never; Returns: string }
      auth_is_platform_admin: { Args: never; Returns: boolean }
      reserve_invoice_number: {
        Args: { p_numbering_id: string }
        Returns: number
      }
      reserve_ecf_sequence_number: {
        Args: { p_ambiente: string; p_business_id: string; p_tipo_ecf: string }
        Returns: number
      }
      select_lot_for_sale: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_product_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
