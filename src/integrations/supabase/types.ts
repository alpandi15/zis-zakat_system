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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      asnaf_settings: {
        Row: {
          asnaf_code: string
          asnaf_name: string
          created_at: string
          distribution_percentage: number
          id: string
          is_active: boolean
          is_system_default: boolean
          receives_fidyah: boolean
          receives_zakat_fitrah: boolean
          receives_zakat_mal: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          asnaf_code: string
          asnaf_name: string
          created_at?: string
          distribution_percentage?: number
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          receives_fidyah?: boolean
          receives_zakat_fitrah?: boolean
          receives_zakat_mal?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          asnaf_code?: string
          asnaf_name?: string
          created_at?: string
          distribution_percentage?: number
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          receives_fidyah?: boolean
          receives_zakat_fitrah?: boolean
          receives_zakat_mal?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      distribution_assignments: {
        Row: {
          assigned_at: string
          assigned_to: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_notes: string | null
          id: string
          mustahik_id: string
          period_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_to: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          id?: string
          mustahik_id: string
          period_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_to?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          id?: string
          mustahik_id?: string
          period_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_assignments_mustahik_id_fkey"
            columns: ["mustahik_id"]
            isOneToOne: false
            referencedRelation: "mustahik"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_assignments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_calculation_batch_items: {
        Row: {
          asnaf_code: string | null
          batch_id: string
          cash_amount: number
          created_at: string
          food_amount_kg: number
          fund_category: Database["public"]["Enums"]["fund_category"]
          id: string
          is_amil: boolean
          mustahik_id: string
          period_id: string
          priority: Database["public"]["Enums"]["priority_level"] | null
          rice_amount_kg: number
        }
        Insert: {
          asnaf_code?: string | null
          batch_id: string
          cash_amount?: number
          created_at?: string
          food_amount_kg?: number
          fund_category: Database["public"]["Enums"]["fund_category"]
          id?: string
          is_amil?: boolean
          mustahik_id: string
          period_id: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          rice_amount_kg?: number
        }
        Update: {
          asnaf_code?: string | null
          batch_id?: string
          cash_amount?: number
          created_at?: string
          food_amount_kg?: number
          fund_category?: Database["public"]["Enums"]["fund_category"]
          id?: string
          is_amil?: boolean
          mustahik_id?: string
          period_id?: string
          priority?: Database["public"]["Enums"]["priority_level"] | null
          rice_amount_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "distribution_calculation_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "distribution_calculation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_calculation_batch_items_mustahik_id_fkey"
            columns: ["mustahik_id"]
            isOneToOne: false
            referencedRelation: "mustahik"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_calculation_batch_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_calculation_batches: {
        Row: {
          amil_distribution_mode: string
          amil_share_factor: number
          batch_code: string
          batch_no: number
          created_at: string
          distributed_at: string | null
          distributed_by: string | null
          id: string
          locked_at: string
          locked_by: string | null
          notes: string | null
          period_id: string
          status: string
          total_allocated_cash: number
          total_allocated_food_kg: number
          total_allocated_rice_kg: number
          updated_at: string
        }
        Insert: {
          amil_distribution_mode?: string
          amil_share_factor?: number
          batch_code?: string
          batch_no?: number
          created_at?: string
          distributed_at?: string | null
          distributed_by?: string | null
          id?: string
          locked_at?: string
          locked_by?: string | null
          notes?: string | null
          period_id: string
          status?: string
          total_allocated_cash?: number
          total_allocated_food_kg?: number
          total_allocated_rice_kg?: number
          updated_at?: string
        }
        Update: {
          amil_distribution_mode?: string
          amil_share_factor?: number
          batch_code?: string
          batch_no?: number
          created_at?: string
          distributed_at?: string | null
          distributed_by?: string | null
          id?: string
          locked_at?: string
          locked_by?: string | null
          notes?: string | null
          period_id?: string
          status?: string
          total_allocated_cash?: number
          total_allocated_food_kg?: number
          total_allocated_rice_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_calculation_batches_distributed_by_fkey"
            columns: ["distributed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_calculation_batches_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_calculation_batches_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      fidyah_distributions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cash_amount: number | null
          created_at: string
          created_by: string | null
          distributed_at: string | null
          distributed_by: string | null
          distribution_date: string
          food_amount_kg: number | null
          food_type: string | null
          fund_category: Database["public"]["Enums"]["fund_category"]
          id: string
          mustahik_id: string
          notes: string | null
          period_id: string
          status: Database["public"]["Enums"]["distribution_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          distributed_at?: string | null
          distributed_by?: string | null
          distribution_date?: string
          food_amount_kg?: number | null
          food_type?: string | null
          fund_category: Database["public"]["Enums"]["fund_category"]
          id?: string
          mustahik_id: string
          notes?: string | null
          period_id: string
          status?: Database["public"]["Enums"]["distribution_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          distributed_at?: string | null
          distributed_by?: string | null
          distribution_date?: string
          food_amount_kg?: number | null
          food_type?: string | null
          fund_category?: Database["public"]["Enums"]["fund_category"]
          id?: string
          mustahik_id?: string
          notes?: string | null
          period_id?: string
          status?: Database["public"]["Enums"]["distribution_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fidyah_distributions_mustahik_id_fkey"
            columns: ["mustahik_id"]
            isOneToOne: false
            referencedRelation: "mustahik"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fidyah_distributions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      fidyah_transactions: {
        Row: {
          beneficiary_name: string | null
          beneficiary_relationship: string | null
          cash_amount: number | null
          correction_of_transaction_id: string | null
          created_at: string
          created_by: string | null
          daily_rate: number
          food_amount_kg: number | null
          food_type: string | null
          id: string
          is_paying_for_self: boolean
          is_void: boolean
          locked_batch_id: string | null
          missed_days: number
          notes: string | null
          payer_address: string | null
          payer_member_id: string | null
          payer_muzakki_id: string | null
          payer_name: string
          payer_phone: string | null
          payment_type: Database["public"]["Enums"]["fidyah_payment_type"]
          period_id: string
          reason: Database["public"]["Enums"]["fidyah_reason"]
          reason_notes: string | null
          total_amount: number
          transaction_no: number
          transaction_date: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          beneficiary_name?: string | null
          beneficiary_relationship?: string | null
          cash_amount?: number | null
          correction_of_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate: number
          food_amount_kg?: number | null
          food_type?: string | null
          id?: string
          is_paying_for_self?: boolean
          is_void?: boolean
          locked_batch_id?: string | null
          missed_days: number
          notes?: string | null
          payer_address?: string | null
          payer_member_id?: string | null
          payer_muzakki_id?: string | null
          payer_name: string
          payer_phone?: string | null
          payment_type?: Database["public"]["Enums"]["fidyah_payment_type"]
          period_id: string
          reason: Database["public"]["Enums"]["fidyah_reason"]
          reason_notes?: string | null
          total_amount: number
          transaction_no?: number
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          beneficiary_name?: string | null
          beneficiary_relationship?: string | null
          cash_amount?: number | null
          correction_of_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          daily_rate?: number
          food_amount_kg?: number | null
          food_type?: string | null
          id?: string
          is_paying_for_self?: boolean
          is_void?: boolean
          locked_batch_id?: string | null
          missed_days?: number
          notes?: string | null
          payer_address?: string | null
          payer_member_id?: string | null
          payer_muzakki_id?: string | null
          payer_name?: string
          payer_phone?: string | null
          payment_type?: Database["public"]["Enums"]["fidyah_payment_type"]
          period_id?: string
          reason?: Database["public"]["Enums"]["fidyah_reason"]
          reason_notes?: string | null
          total_amount?: number
          transaction_no?: number
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fidyah_transactions_correction_of_transaction_id_fkey"
            columns: ["correction_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "fidyah_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fidyah_transactions_locked_batch_id_fkey"
            columns: ["locked_batch_id"]
            isOneToOne: false
            referencedRelation: "distribution_calculation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fidyah_transactions_payer_member_id_fkey"
            columns: ["payer_member_id"]
            isOneToOne: false
            referencedRelation: "muzakki_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fidyah_transactions_payer_muzakki_id_fkey"
            columns: ["payer_muzakki_id"]
            isOneToOne: false
            referencedRelation: "muzakki"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fidyah_transactions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fidyah_transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_ledger: {
        Row: {
          amount_cash: number | null
          amount_food_kg: number | null
          amount_rice_kg: number | null
          category: Database["public"]["Enums"]["fund_category"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          notes: string | null
          period_id: string
          reference_id: string | null
          reference_type: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["ledger_transaction_type"]
          updated_at: string
        }
        Insert: {
          amount_cash?: number | null
          amount_food_kg?: number | null
          amount_rice_kg?: number | null
          category: Database["public"]["Enums"]["fund_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          period_id: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["ledger_transaction_type"]
          updated_at?: string
        }
        Update: {
          amount_cash?: number | null
          amount_food_kg?: number | null
          amount_rice_kg?: number | null
          category?: Database["public"]["Enums"]["fund_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          period_id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["ledger_transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_ledger_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      mustahik: {
        Row: {
          address: string | null
          asnaf: Database["public"]["Enums"]["asnaf_type"]
          asnaf_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_order: number | null
          distribution_lane: string | null
          distribution_rt: string | null
          email: string | null
          family_members: number | null
          id: string
          is_active: boolean
          monthly_expense: number | null
          monthly_income: number | null
          name: string
          notes: string | null
          phone: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          address?: string | null
          asnaf: Database["public"]["Enums"]["asnaf_type"]
          asnaf_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_order?: number | null
          distribution_lane?: string | null
          distribution_rt?: string | null
          email?: string | null
          family_members?: number | null
          id?: string
          is_active?: boolean
          monthly_expense?: number | null
          monthly_income?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          address?: string | null
          asnaf?: Database["public"]["Enums"]["asnaf_type"]
          asnaf_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_order?: number | null
          distribution_lane?: string | null
          distribution_rt?: string | null
          email?: string | null
          family_members?: number | null
          id?: string
          is_active?: boolean
          monthly_expense?: number | null
          monthly_income?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mustahik_asnaf_id_fkey"
            columns: ["asnaf_id"]
            isOneToOne: false
            referencedRelation: "asnaf_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      muzakki: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      muzakki_members: {
        Row: {
          birth_date: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_dependent: boolean
          muzakki_id: string
          name: string
          notes: string | null
          relationship: Database["public"]["Enums"]["member_relationship"]
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_dependent?: boolean
          muzakki_id: string
          name: string
          notes?: string | null
          relationship: Database["public"]["Enums"]["member_relationship"]
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_dependent?: boolean
          muzakki_id?: string
          name?: string
          notes?: string | null
          relationship?: Database["public"]["Enums"]["member_relationship"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "muzakki_members_muzakki_id_fkey"
            columns: ["muzakki_id"]
            isOneToOne: false
            referencedRelation: "muzakki"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          amil_distribution_mode: string
          amil_share_factor: number
          archived_at: string | null
          archived_by: string | null
          cash_amount_per_person: number | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          fidyah_daily_rate: number | null
          gregorian_year: number
          hijri_year: number
          id: string
          name: string
          nisab_gold_price_per_gram: number | null
          nisab_silver_price_per_gram: number | null
          rice_amount_per_person: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
        }
        Insert: {
          amil_distribution_mode?: string
          amil_share_factor?: number
          archived_at?: string | null
          archived_by?: string | null
          cash_amount_per_person?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          fidyah_daily_rate?: number | null
          gregorian_year: number
          hijri_year: number
          id?: string
          name: string
          nisab_gold_price_per_gram?: number | null
          nisab_silver_price_per_gram?: number | null
          rice_amount_per_person?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Update: {
          amil_distribution_mode?: string
          amil_share_factor?: number
          archived_at?: string | null
          archived_by?: string | null
          cash_amount_per_person?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          fidyah_daily_rate?: number | null
          gregorian_year?: number
          hijri_year?: number
          id?: string
          name?: string
          nisab_gold_price_per_gram?: number | null
          nisab_silver_price_per_gram?: number | null
          rice_amount_per_person?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zakat_distributions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cash_amount: number | null
          created_at: string
          created_by: string | null
          distributed_at: string | null
          distributed_by: string | null
          distribution_date: string
          fund_category: Database["public"]["Enums"]["fund_category"]
          id: string
          mustahik_id: string
          notes: string | null
          period_id: string
          rice_amount_kg: number | null
          status: Database["public"]["Enums"]["distribution_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          distributed_at?: string | null
          distributed_by?: string | null
          distribution_date?: string
          fund_category: Database["public"]["Enums"]["fund_category"]
          id?: string
          mustahik_id: string
          notes?: string | null
          period_id: string
          rice_amount_kg?: number | null
          status?: Database["public"]["Enums"]["distribution_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          distributed_at?: string | null
          distributed_by?: string | null
          distribution_date?: string
          fund_category?: Database["public"]["Enums"]["fund_category"]
          id?: string
          mustahik_id?: string
          notes?: string | null
          period_id?: string
          rice_amount_kg?: number | null
          status?: Database["public"]["Enums"]["distribution_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zakat_distributions_mustahik_id_fkey"
            columns: ["mustahik_id"]
            isOneToOne: false
            referencedRelation: "mustahik"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_distributions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      zakat_fitrah_transaction_items: {
        Row: {
          created_at: string
          id: string
          is_void: boolean
          money_amount: number | null
          muzakki_member_id: string
          period_id: string
          rice_amount_kg: number | null
          transaction_id: string
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_void?: boolean
          money_amount?: number | null
          muzakki_member_id: string
          period_id: string
          rice_amount_kg?: number | null
          transaction_id: string
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_void?: boolean
          money_amount?: number | null
          muzakki_member_id?: string
          period_id?: string
          rice_amount_kg?: number | null
          transaction_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zakat_fitrah_transaction_items_muzakki_member_id_fkey"
            columns: ["muzakki_member_id"]
            isOneToOne: false
            referencedRelation: "muzakki_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_fitrah_transaction_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_fitrah_transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "zakat_fitrah_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      zakat_fitrah_transactions: {
        Row: {
          correction_of_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_custom_total_rice: boolean
          is_void: boolean
          locked_batch_id: string | null
          money_amount: number | null
          muzakki_id: string
          notes: string | null
          payment_type: Database["public"]["Enums"]["zakat_payment_type"]
          period_id: string
          rice_amount_kg: number | null
          rice_price_per_kg: number | null
          total_members: number
          transaction_no: number
          transaction_date: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          correction_of_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_custom_total_rice?: boolean
          is_void?: boolean
          locked_batch_id?: string | null
          money_amount?: number | null
          muzakki_id: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["zakat_payment_type"]
          period_id: string
          rice_amount_kg?: number | null
          rice_price_per_kg?: number | null
          total_members?: number
          transaction_no?: number
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          correction_of_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_custom_total_rice?: boolean
          is_void?: boolean
          locked_batch_id?: string | null
          money_amount?: number | null
          muzakki_id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["zakat_payment_type"]
          period_id?: string
          rice_amount_kg?: number | null
          rice_price_per_kg?: number | null
          total_members?: number
          transaction_no?: number
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zakat_fitrah_transactions_correction_of_transaction_id_fkey"
            columns: ["correction_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "zakat_fitrah_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_fitrah_transactions_locked_batch_id_fkey"
            columns: ["locked_batch_id"]
            isOneToOne: false
            referencedRelation: "distribution_calculation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_fitrah_transactions_muzakki_id_fkey"
            columns: ["muzakki_id"]
            isOneToOne: false
            referencedRelation: "muzakki"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_fitrah_transactions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_fitrah_transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      zakat_mal_transactions: {
        Row: {
          calculated_zakat: number
          correction_of_transaction_id: string | null
          created_at: string
          created_by: string | null
          deductions: number | null
          final_zakat_amount: number
          gold_type: string | null
          gold_weight_gram: number | null
          gross_amount: number
          id: string
          income_source: string | null
          inventory_value: number | null
          is_above_nisab: boolean
          is_manually_overridden: boolean
          is_void: boolean
          locked_batch_id: string | null
          muzakki_member_id: string | null
          muzakki_id: string
          net_amount: number
          nisab_gold_price_per_gram: number | null
          nisab_silver_price_per_gram: number | null
          nisab_value: number
          notes: string | null
          override_reason: string | null
          payables: number | null
          payment_method: string | null
          period_id: string
          receivables: number | null
          transaction_no: number
          transaction_date: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          zakat_percentage: number
          zakat_type: Database["public"]["Enums"]["zakat_mal_type"]
        }
        Insert: {
          calculated_zakat: number
          correction_of_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          deductions?: number | null
          final_zakat_amount: number
          gold_type?: string | null
          gold_weight_gram?: number | null
          gross_amount: number
          id?: string
          income_source?: string | null
          inventory_value?: number | null
          is_above_nisab?: boolean
          is_manually_overridden?: boolean
          is_void?: boolean
          locked_batch_id?: string | null
          muzakki_member_id?: string | null
          muzakki_id: string
          net_amount: number
          nisab_gold_price_per_gram?: number | null
          nisab_silver_price_per_gram?: number | null
          nisab_value: number
          notes?: string | null
          override_reason?: string | null
          payables?: number | null
          payment_method?: string | null
          period_id: string
          receivables?: number | null
          transaction_no?: number
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          zakat_percentage?: number
          zakat_type: Database["public"]["Enums"]["zakat_mal_type"]
        }
        Update: {
          calculated_zakat?: number
          correction_of_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          deductions?: number | null
          final_zakat_amount?: number
          gold_type?: string | null
          gold_weight_gram?: number | null
          gross_amount?: number
          id?: string
          income_source?: string | null
          inventory_value?: number | null
          is_above_nisab?: boolean
          is_manually_overridden?: boolean
          is_void?: boolean
          locked_batch_id?: string | null
          muzakki_member_id?: string | null
          muzakki_id?: string
          net_amount?: number
          nisab_gold_price_per_gram?: number | null
          nisab_silver_price_per_gram?: number | null
          nisab_value?: number
          notes?: string | null
          override_reason?: string | null
          payables?: number | null
          payment_method?: string | null
          period_id?: string
          receivables?: number | null
          transaction_no?: number
          transaction_date?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          zakat_percentage?: number
          zakat_type?: Database["public"]["Enums"]["zakat_mal_type"]
        }
        Relationships: [
          {
            foreignKeyName: "zakat_mal_transactions_correction_of_transaction_id_fkey"
            columns: ["correction_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "zakat_mal_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_mal_transactions_locked_batch_id_fkey"
            columns: ["locked_batch_id"]
            isOneToOne: false
            referencedRelation: "distribution_calculation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_mal_transactions_muzakki_member_id_fkey"
            columns: ["muzakki_member_id"]
            isOneToOne: false
            referencedRelation: "muzakki_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_mal_transactions_muzakki_id_fkey"
            columns: ["muzakki_id"]
            isOneToOne: false
            referencedRelation: "muzakki"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_mal_transactions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zakat_mal_transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_fund_availability: {
        Args: {
          _cash_needed?: number
          _category: Database["public"]["Enums"]["fund_category"]
          _food_needed?: number
          _period_id: string
          _rice_needed?: number
        }
        Returns: boolean
      }
      get_all_fund_balances: {
        Args: { _period_id: string }
        Returns: {
          category: Database["public"]["Enums"]["fund_category"]
          total_cash: number
          total_food_kg: number
          total_rice_kg: number
        }[]
      }
      get_fund_balance: {
        Args: {
          _category: Database["public"]["Enums"]["fund_category"]
          _period_id: string
        }
        Returns: {
          total_cash: number
          total_food_kg: number
          total_rice_kg: number
        }[]
      }
      get_public_fund_summary: {
        Args: { _period_id: string }
        Returns: {
          category: string
          total_collected: number
          total_distributed: number
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_period_active: { Args: { _period_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "chairman"
        | "secretary"
        | "treasurer"
        | "zakat_officer"
        | "fidyah_officer"
        | "viewer"
      asnaf_type:
        | "fakir"
        | "miskin"
        | "amil"
        | "muallaf"
        | "riqab"
        | "gharimin"
        | "fisabilillah"
        | "ibnu_sabil"
      distribution_status: "pending" | "approved" | "distributed" | "cancelled"
      fidyah_payment_type: "cash" | "food"
      fidyah_reason:
        | "chronic_illness"
        | "elderly"
        | "pregnancy"
        | "breastfeeding"
        | "terminal_illness"
        | "other"
      fund_category:
        | "zakat_fitrah_cash"
        | "zakat_fitrah_rice"
        | "zakat_mal"
        | "fidyah_cash"
        | "fidyah_food"
      ledger_transaction_type:
        | "collection"
        | "distribution"
        | "adjustment"
        | "transfer_out"
        | "transfer_in"
      member_relationship: "head_of_family" | "wife" | "child" | "parent"
      period_status: "active" | "archived"
      priority_level: "low" | "medium" | "high" | "urgent"
      zakat_mal_type: "income" | "gold" | "trade"
      zakat_payment_type: "rice" | "money"
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
    Enums: {
      app_role: [
        "super_admin",
        "chairman",
        "secretary",
        "treasurer",
        "zakat_officer",
        "fidyah_officer",
        "viewer",
      ],
      asnaf_type: [
        "fakir",
        "miskin",
        "amil",
        "muallaf",
        "riqab",
        "gharimin",
        "fisabilillah",
        "ibnu_sabil",
      ],
      distribution_status: ["pending", "approved", "distributed", "cancelled"],
      fidyah_payment_type: ["cash", "food"],
      fidyah_reason: [
        "chronic_illness",
        "elderly",
        "pregnancy",
        "breastfeeding",
        "terminal_illness",
        "other",
      ],
      fund_category: [
        "zakat_fitrah_cash",
        "zakat_fitrah_rice",
        "zakat_mal",
        "fidyah_cash",
        "fidyah_food",
      ],
      ledger_transaction_type: [
        "collection",
        "distribution",
        "adjustment",
        "transfer_out",
        "transfer_in",
      ],
      member_relationship: ["head_of_family", "wife", "child", "parent"],
      period_status: ["active", "archived"],
      priority_level: ["low", "medium", "high", "urgent"],
      zakat_mal_type: ["income", "gold", "trade"],
      zakat_payment_type: ["rice", "money"],
    },
  },
} as const
