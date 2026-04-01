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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          card_id: string
          created_at: string | null
          created_by: string | null
          descricao: string
          id: string
          metadata: Json | null
          org_id: string
          party_type: string | null
          tipo: string
        }
        Insert: {
          card_id: string
          created_at?: string | null
          created_by?: string | null
          descricao: string
          id?: string
          metadata?: Json | null
          org_id?: string
          party_type?: string | null
          tipo: string
        }
        Update: {
          card_id?: string
          created_at?: string | null
          created_by?: string | null
          descricao?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          party_type?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "activities_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_categories: {
        Row: {
          created_at: string | null
          key: string
          label: string
          ordem: number | null
          scope: string
          visible: boolean | null
        }
        Insert: {
          created_at?: string | null
          key: string
          label: string
          ordem?: number | null
          scope: string
          visible?: boolean | null
        }
        Update: {
          created_at?: string | null
          key?: string
          label?: string
          ordem?: number | null
          scope?: string
          visible?: boolean | null
        }
        Relationships: []
      }
      ai_extraction_field_config: {
        Row: {
          allowed_values: Json | null
          created_at: string | null
          field_key: string
          field_type: string
          id: string
          is_active: boolean | null
          label: string
          prompt_examples: string | null
          prompt_extract_when: string | null
          prompt_format: string | null
          prompt_question: string
          section: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          allowed_values?: Json | null
          created_at?: string | null
          field_key: string
          field_type: string
          id?: string
          is_active?: boolean | null
          label: string
          prompt_examples?: string | null
          prompt_extract_when?: string | null
          prompt_format?: string | null
          prompt_question: string
          section: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          allowed_values?: Json | null
          created_at?: string | null
          field_key?: string
          field_type?: string
          id?: string
          is_active?: boolean | null
          label?: string
          prompt_examples?: string | null
          prompt_extract_when?: string | null
          prompt_format?: string | null
          prompt_question?: string
          section?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          metadata: Json | null
          name: string
          org_id: string
          permissions: Json | null
          rate_limit: number | null
          request_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          metadata?: Json | null
          name: string
          org_id?: string
          permissions?: Json | null
          rate_limit?: number | null
          request_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          metadata?: Json | null
          name?: string
          org_id?: string
          permissions?: Json | null
          rate_limit?: number | null
          request_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          error_message: string | null
          id: string
          ip_address: string | null
          method: string
          request_body: Json | null
          response_time_ms: number | null
          status_code: number
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          method: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code: number
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      arquivos: {
        Row: {
          caminho_arquivo: string
          card_id: string
          created_at: string | null
          created_by: string | null
          descricao: string | null
          id: string
          mime_type: string | null
          nome_original: string
          org_id: string
          pessoa_id: string | null
          tamanho_bytes: number | null
        }
        Insert: {
          caminho_arquivo: string
          card_id: string
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          id?: string
          mime_type?: string | null
          nome_original: string
          org_id?: string
          pessoa_id?: string | null
          tamanho_bytes?: number | null
        }
        Update: {
          caminho_arquivo?: string
          card_id?: string
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          id?: string
          mime_type?: string | null
          nome_original?: string
          org_id?: string
          pessoa_id?: string | null
          tamanho_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "arquivos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      automation_log: {
        Row: {
          card_id: string
          conditions_evaluated: Json | null
          error_message: string | null
          id: string
          org_id: string
          rule_id: string | null
          status: string | null
          task_id: string | null
          trigger_stage_from: string | null
          trigger_stage_to: string | null
          triggered_at: string | null
        }
        Insert: {
          card_id: string
          conditions_evaluated?: Json | null
          error_message?: string | null
          id?: string
          org_id?: string
          rule_id?: string | null
          status?: string | null
          task_id?: string | null
          trigger_stage_from?: string | null
          trigger_stage_to?: string | null
          triggered_at?: string | null
        }
        Update: {
          card_id?: string
          conditions_evaluated?: Json | null
          error_message?: string | null
          id?: string
          org_id?: string
          rule_id?: string | null
          status?: string | null
          task_id?: string | null
          trigger_stage_from?: string | null
          trigger_stage_to?: string | null
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "automation_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_agenda"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          assign_to: string | null
          assign_to_user_id: string | null
          conditions: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          order_index: number | null
          org_id: string
          pipeline_id: string
          task_descricao: string | null
          task_prioridade: string | null
          task_tipo: string
          task_titulo: string
          timing_business_hour_end: string | null
          timing_business_hour_start: string | null
          timing_respect_business_hours: boolean | null
          timing_type: string | null
          timing_value: number | null
          trigger_stage_id: string
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          assign_to?: string | null
          assign_to_user_id?: string | null
          conditions?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          org_id?: string
          pipeline_id: string
          task_descricao?: string | null
          task_prioridade?: string | null
          task_tipo: string
          task_titulo: string
          timing_business_hour_end?: string | null
          timing_business_hour_start?: string | null
          timing_respect_business_hours?: boolean | null
          timing_type?: string | null
          timing_value?: number | null
          trigger_stage_id: string
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          assign_to?: string | null
          assign_to_user_id?: string | null
          conditions?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          org_id?: string
          pipeline_id?: string
          task_descricao?: string | null
          task_prioridade?: string | null
          task_tipo?: string
          task_titulo?: string
          timing_business_hour_end?: string | null
          timing_business_hour_start?: string | null
          timing_respect_business_hours?: boolean | null
          timing_type?: string | null
          timing_value?: number | null
          trigger_stage_id?: string
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_dead_letter: {
        Row: {
          error_details: Json | null
          error_message: string
          failed_at: string | null
          id: string
          instance_id: string | null
          original_queue_id: string | null
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          step_id: string | null
        }
        Insert: {
          error_details?: Json | null
          error_message: string
          failed_at?: string | null
          id?: string
          instance_id?: string | null
          original_queue_id?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          step_id?: string | null
        }
        Update: {
          error_details?: Json | null
          error_message?: string
          failed_at?: string | null
          id?: string
          instance_id?: string | null
          original_queue_id?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadence_dead_letter_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "cadence_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_dead_letter_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "cadence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_entry_queue: {
        Row: {
          attempts: number | null
          card_id: string
          created_at: string | null
          event_data: Json | null
          event_type: string
          execute_at: string
          id: string
          last_error: string | null
          max_attempts: number | null
          org_id: string
          processed_at: string | null
          status: string | null
          trigger_id: string
        }
        Insert: {
          attempts?: number | null
          card_id: string
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          execute_at: string
          id?: string
          last_error?: string | null
          max_attempts?: number | null
          org_id?: string
          processed_at?: string | null
          status?: string | null
          trigger_id: string
        }
        Update: {
          attempts?: number | null
          card_id?: string
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          execute_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number | null
          org_id?: string
          processed_at?: string | null
          status?: string | null
          trigger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_entry_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_entry_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_entry_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_entry_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cadence_entry_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_entry_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_entry_queue_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "cadence_event_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_event_log: {
        Row: {
          action_result: Json | null
          action_taken: string | null
          card_id: string | null
          created_at: string | null
          event_data: Json | null
          event_source: string
          event_type: string
          id: string
          instance_id: string | null
          org_id: string
        }
        Insert: {
          action_result?: Json | null
          action_taken?: string | null
          card_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_source: string
          event_type: string
          id?: string
          instance_id?: string | null
          org_id?: string
        }
        Update: {
          action_result?: Json | null
          action_taken?: string | null
          card_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_source?: string
          event_type?: string
          id?: string
          instance_id?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_event_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_event_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_event_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_event_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cadence_event_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_event_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "cadence_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_event_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_event_triggers: {
        Row: {
          action_config: Json | null
          action_type: string
          allowed_weekdays: number[] | null
          applicable_pipeline_ids: string[] | null
          applicable_stage_ids: string[] | null
          business_hours_end: number | null
          business_hours_start: number | null
          conditions: Json | null
          created_at: string | null
          delay_minutes: number | null
          delay_type: string | null
          event_config: Json | null
          event_type: string
          id: string
          is_active: boolean | null
          is_global: boolean | null
          name: string | null
          priority: number | null
          target_template_id: string | null
          task_config: Json | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          allowed_weekdays?: number[] | null
          applicable_pipeline_ids?: string[] | null
          applicable_stage_ids?: string[] | null
          business_hours_end?: number | null
          business_hours_start?: number | null
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          delay_type?: string | null
          event_config?: Json | null
          event_type: string
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          name?: string | null
          priority?: number | null
          target_template_id?: string | null
          task_config?: Json | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          allowed_weekdays?: number[] | null
          applicable_pipeline_ids?: string[] | null
          applicable_stage_ids?: string[] | null
          business_hours_end?: number | null
          business_hours_start?: number | null
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          delay_type?: string | null
          event_config?: Json | null
          event_type?: string
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          name?: string | null
          priority?: number | null
          target_template_id?: string | null
          task_config?: Json | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadence_event_triggers_target_template_id_fkey"
            columns: ["target_template_id"]
            isOneToOne: false
            referencedRelation: "cadence_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_event_triggers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cadence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_instances: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          card_id: string
          completed_at: string | null
          context: Json | null
          created_by: string | null
          current_step_id: string | null
          id: string
          org_id: string
          paused_at: string | null
          started_at: string | null
          status: string | null
          successful_contacts: number | null
          template_id: string
          total_contacts_attempted: number | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          card_id: string
          completed_at?: string | null
          context?: Json | null
          created_by?: string | null
          current_step_id?: string | null
          id?: string
          org_id?: string
          paused_at?: string | null
          started_at?: string | null
          status?: string | null
          successful_contacts?: number | null
          template_id: string
          total_contacts_attempted?: number | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          card_id?: string
          completed_at?: string | null
          context?: Json | null
          created_by?: string | null
          current_step_id?: string | null
          id?: string
          org_id?: string
          paused_at?: string | null
          started_at?: string | null
          status?: string | null
          successful_contacts?: number | null
          template_id?: string
          total_contacts_attempted?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cadence_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cadence_instances_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_instances_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "cadence_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cadence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_queue: {
        Row: {
          attempts: number | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          execute_at: string
          id: string
          instance_id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number | null
          priority: number | null
          status: string | null
          step_id: string
        }
        Insert: {
          attempts?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          execute_at: string
          id?: string
          instance_id: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number | null
          priority?: number | null
          status?: string | null
          step_id: string
        }
        Update: {
          attempts?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          execute_at?: string
          id?: string
          instance_id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number | null
          priority?: number | null
          status?: string | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_queue_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "cadence_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_queue_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "cadence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_steps: {
        Row: {
          branch_config: Json | null
          created_at: string | null
          day_offset: number | null
          end_config: Json | null
          id: string
          next_step_key: string | null
          org_id: string
          requires_previous_completed: boolean | null
          step_key: string
          step_order: number
          step_type: string
          task_config: Json | null
          template_id: string
          time_of_day_minutes: number | null
          visibility_conditions: Json | null
          wait_config: Json | null
        }
        Insert: {
          branch_config?: Json | null
          created_at?: string | null
          day_offset?: number | null
          end_config?: Json | null
          id?: string
          next_step_key?: string | null
          org_id?: string
          requires_previous_completed?: boolean | null
          step_key: string
          step_order: number
          step_type: string
          task_config?: Json | null
          template_id: string
          time_of_day_minutes?: number | null
          visibility_conditions?: Json | null
          wait_config?: Json | null
        }
        Update: {
          branch_config?: Json | null
          created_at?: string | null
          day_offset?: number | null
          end_config?: Json | null
          id?: string
          next_step_key?: string | null
          org_id?: string
          requires_previous_completed?: boolean | null
          step_key?: string
          step_order?: number
          step_type?: string
          task_config?: Json | null
          template_id?: string
          time_of_day_minutes?: number | null
          visibility_conditions?: Json | null
          wait_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cadence_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cadence_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_templates: {
        Row: {
          allowed_weekdays: number[] | null
          applicable_stages: string[] | null
          auto_cancel_on_stage_change: boolean | null
          business_hours_end: number | null
          business_hours_start: number | null
          created_at: string | null
          created_by: string | null
          day_pattern: Json | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          require_completion_for_next: boolean | null
          respect_business_hours: boolean | null
          schedule_mode: string | null
          soft_break_after_days: number | null
          target_audience: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_weekdays?: number[] | null
          applicable_stages?: string[] | null
          auto_cancel_on_stage_change?: boolean | null
          business_hours_end?: number | null
          business_hours_start?: number | null
          created_at?: string | null
          created_by?: string | null
          day_pattern?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id?: string
          require_completion_for_next?: boolean | null
          respect_business_hours?: boolean | null
          schedule_mode?: string | null
          soft_break_after_days?: number | null
          target_audience?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_weekdays?: number[] | null
          applicable_stages?: string[] | null
          auto_cancel_on_stage_change?: boolean | null
          business_hours_end?: number | null
          business_hours_start?: number | null
          created_at?: string | null
          created_by?: string | null
          day_pattern?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          require_completion_for_next?: boolean | null
          respect_business_hours?: boolean | null
          schedule_mode?: string | null
          soft_break_after_days?: number | null
          target_audience?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadence_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      card_auto_creation_rules: {
        Row: {
          copy_contacts: boolean | null
          copy_title: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          source_owner_ids: string[] | null
          source_pipeline_ids: string[]
          source_stage_ids: string[]
          target_owner_id: string | null
          target_owner_mode: string
          target_pipeline_id: string
          target_stage_id: string
          title_prefix: string | null
          updated_at: string | null
        }
        Insert: {
          copy_contacts?: boolean | null
          copy_title?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          source_owner_ids?: string[] | null
          source_pipeline_ids: string[]
          source_stage_ids: string[]
          target_owner_id?: string | null
          target_owner_mode?: string
          target_pipeline_id: string
          target_stage_id: string
          title_prefix?: string | null
          updated_at?: string | null
        }
        Update: {
          copy_contacts?: boolean | null
          copy_title?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          source_owner_ids?: string[] | null
          source_pipeline_ids?: string[]
          source_stage_ids?: string[]
          target_owner_id?: string | null
          target_owner_mode?: string
          target_pipeline_id?: string
          target_stage_id?: string
          title_prefix?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_auto_creation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_target_owner_id_fkey"
            columns: ["target_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_target_owner_id_fkey"
            columns: ["target_owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_target_owner_id_fkey"
            columns: ["target_owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_target_pipeline_id_fkey"
            columns: ["target_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_auto_creation_rules_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      card_creation_rules: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          org_id: string
          stage_id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_id?: string
          stage_id: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_id?: string
          stage_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_creation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_creation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_creation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_creation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_creation_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_creation_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "card_creation_rules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_creation_rules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["team_id"]
          },
        ]
      }
      card_document_requirements: {
        Row: {
          arquivo_id: string | null
          card_id: string
          contato_id: string
          created_at: string
          data_value: string | null
          document_type_id: string
          id: string
          modo: string
          notas: string | null
          org_id: string
          recebido_em: string | null
          recebido_por: string | null
          status: string
        }
        Insert: {
          arquivo_id?: string | null
          card_id: string
          contato_id: string
          created_at?: string
          data_value?: string | null
          document_type_id: string
          id?: string
          modo?: string
          notas?: string | null
          org_id?: string
          recebido_em?: string | null
          recebido_por?: string | null
          status?: string
        }
        Update: {
          arquivo_id?: string | null
          card_id?: string
          contato_id?: string
          created_at?: string
          data_value?: string | null
          document_type_id?: string
          id?: string
          modo?: string
          notas?: string | null
          org_id?: string
          recebido_em?: string | null
          recebido_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_document_requirements_arquivo_id_fkey"
            columns: ["arquivo_id"]
            isOneToOne: false
            referencedRelation: "arquivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_document_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "card_document_requirements_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_document_requirements_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_document_requirements_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      card_financial_items: {
        Row: {
          card_id: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          description: string | null
          documento: string | null
          fornecedor: string | null
          id: string
          is_ready: boolean | null
          notes: string | null
          observacoes: string | null
          org_id: string
          product_type: string
          representante: string | null
          sale_value: number
          supplier_cost: number
          updated_at: string | null
        }
        Insert: {
          card_id: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          description?: string | null
          documento?: string | null
          fornecedor?: string | null
          id?: string
          is_ready?: boolean | null
          notes?: string | null
          observacoes?: string | null
          org_id?: string
          product_type?: string
          representante?: string | null
          sale_value?: number
          supplier_cost?: number
          updated_at?: string | null
        }
        Update: {
          card_id?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          description?: string | null
          documento?: string | null
          fornecedor?: string | null
          id?: string
          is_ready?: boolean | null
          notes?: string | null
          observacoes?: string | null
          org_id?: string
          product_type?: string
          representante?: string | null
          sale_value?: number
          supplier_cost?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_financial_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_financial_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_financial_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_financial_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_financial_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_financial_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      card_gift_assignments: {
        Row: {
          assigned_by: string | null
          budget: number | null
          card_id: string | null
          contato_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_method: string | null
          gift_type: string
          id: string
          notes: string | null
          occasion: string | null
          scheduled_ship_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          status: string
          tarefa_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          budget?: number | null
          card_id?: string | null
          contato_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_method?: string | null
          gift_type?: string
          id?: string
          notes?: string | null
          occasion?: string | null
          scheduled_ship_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          tarefa_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          budget?: number | null
          card_id?: string | null
          contato_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_method?: string | null
          gift_type?: string
          id?: string
          notes?: string | null
          occasion?: string | null
          scheduled_ship_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          tarefa_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_gift_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_gift_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_gift_assignments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "card_gift_assignments_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_shipped_by_fkey"
            columns: ["shipped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_shipped_by_fkey"
            columns: ["shipped_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_gift_assignments_shipped_by_fkey"
            columns: ["shipped_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_assignments_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "view_agenda"
            referencedColumns: ["id"]
          },
        ]
      }
      card_gift_items: {
        Row: {
          assignment_id: string
          created_at: string | null
          custom_name: string | null
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          assignment_id: string
          created_at?: string | null
          custom_name?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          unit_price_snapshot?: number
        }
        Update: {
          assignment_id?: string
          created_at?: string | null
          custom_name?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_gift_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "card_gift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_gift_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      card_owner_history: {
        Row: {
          card_id: string
          created_at: string | null
          ended_at: string | null
          fase: string
          id: string
          org_id: string
          owner_id: string | null
          started_at: string
          transfer_reason: string | null
          transferred_by: string | null
        }
        Insert: {
          card_id: string
          created_at?: string | null
          ended_at?: string | null
          fase: string
          id?: string
          org_id?: string
          owner_id?: string | null
          started_at?: string
          transfer_reason?: string | null
          transferred_by?: string | null
        }
        Update: {
          card_id?: string
          created_at?: string | null
          ended_at?: string | null
          fase?: string
          id?: string
          org_id?: string
          owner_id?: string | null
          started_at?: string
          transfer_reason?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_owner_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_owner_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_owner_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_owner_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_owner_history_transferred_by_fkey"
            columns: ["transferred_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      card_tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          card_id: string
          id: string
          org_id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          card_id: string
          id?: string
          org_id?: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          card_id?: string
          id?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_tag_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "card_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cta_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cta_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "fk_cta_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cta_card_id"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cta_card_id"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cta_card_id"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cta_card_id"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "fk_cta_card_id"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          produto: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          produto?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          produto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ct_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ct_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "fk_ct_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      card_team_members: {
        Row: {
          card_id: string
          created_at: string | null
          created_by: string | null
          id: string
          org_id: string
          profile_id: string
          role: string
        }
        Insert: {
          card_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_id?: string
          profile_id: string
          role?: string
        }
        Update: {
          card_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_team_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_team_members_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          ai_contexto: string | null
          ai_responsavel: string | null
          ai_resumo: string | null
          archived_at: string | null
          archived_by: string | null
          briefing_inicial: Json | null
          campaign_id: string | null
          card_type: string | null
          cliente_recorrente: boolean | null
          codigo_cliente_erp: string | null
          codigo_projeto_erp: string | null
          concierge_owner_id: string | null
          condicoes_pagamento: string | null
          created_at: string | null
          created_by: string | null
          data_fechamento: string | null
          data_pronto_erp: string | null
          data_viagem_fim: string | null
          data_viagem_inicio: string | null
          deleted_at: string | null
          deleted_by: string | null
          dono_atual_id: string | null
          duracao_dias_max: number | null
          duracao_dias_min: number | null
          epoca_ano: number | null
          epoca_mes_fim: number | null
          epoca_mes_inicio: number | null
          epoca_tipo: string | null
          estado_operacional: string | null
          external_id: string | null
          external_source: string | null
          forma_pagamento: string | null
          ganho_planner: boolean | null
          ganho_planner_at: string | null
          ganho_pos: boolean | null
          ganho_pos_at: string | null
          ganho_sdr: boolean | null
          ganho_sdr_at: string | null
          group_capacity: number | null
          group_total_pax: number | null
          group_total_revenue: number | null
          id: string
          indicado_por_id: string | null
          is_group_parent: boolean | null
          locked_fields: Json | null
          marketing_data: Json | null
          merge_config: Json | null
          merge_metadata: Json | null
          merged_at: string | null
          merged_by: string | null
          mkt_buscando_para_viagem: string | null
          moeda: string | null
          motivo_perda_comentario: string | null
          motivo_perda_id: string | null
          org_id: string
          origem: string | null
          origem_lead: string | null
          parent_card_id: string | null
          pessoa_principal_id: string | null
          pipeline_id: string
          pipeline_stage_id: string | null
          pos_owner_id: string | null
          prioridade: string | null
          produto: Database["public"]["Enums"]["app_product"]
          produto_data: Json | null
          pronto_para_contrato: boolean | null
          pronto_para_erp: boolean | null
          receita: number | null
          receita_source: string | null
          sdr_owner_id: string | null
          stage_entered_at: string | null
          status_comercial: string
          sub_card_agregado_em: string | null
          sub_card_category: string | null
          sub_card_mode: string | null
          sub_card_status: string | null
          taxa_alterado_por: string | null
          taxa_ativa: boolean | null
          taxa_codigo_transacao: string | null
          taxa_data_status: string | null
          taxa_meio_pagamento: string | null
          taxa_status: string | null
          taxa_valor: number | null
          titulo: string
          updated_at: string | null
          updated_by: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          valor_estimado: number | null
          valor_final: number | null
          valor_proprio: number | null
          vendas_owner_id: string | null
        }
        Insert: {
          ai_contexto?: string | null
          ai_responsavel?: string | null
          ai_resumo?: string | null
          archived_at?: string | null
          archived_by?: string | null
          briefing_inicial?: Json | null
          campaign_id?: string | null
          card_type?: string | null
          cliente_recorrente?: boolean | null
          codigo_cliente_erp?: string | null
          codigo_projeto_erp?: string | null
          concierge_owner_id?: string | null
          condicoes_pagamento?: string | null
          created_at?: string | null
          created_by?: string | null
          data_fechamento?: string | null
          data_pronto_erp?: string | null
          data_viagem_fim?: string | null
          data_viagem_inicio?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dono_atual_id?: string | null
          duracao_dias_max?: number | null
          duracao_dias_min?: number | null
          epoca_ano?: number | null
          epoca_mes_fim?: number | null
          epoca_mes_inicio?: number | null
          epoca_tipo?: string | null
          estado_operacional?: string | null
          external_id?: string | null
          external_source?: string | null
          forma_pagamento?: string | null
          ganho_planner?: boolean | null
          ganho_planner_at?: string | null
          ganho_pos?: boolean | null
          ganho_pos_at?: string | null
          ganho_sdr?: boolean | null
          ganho_sdr_at?: string | null
          group_capacity?: number | null
          group_total_pax?: number | null
          group_total_revenue?: number | null
          id?: string
          indicado_por_id?: string | null
          is_group_parent?: boolean | null
          locked_fields?: Json | null
          marketing_data?: Json | null
          merge_config?: Json | null
          merge_metadata?: Json | null
          merged_at?: string | null
          merged_by?: string | null
          mkt_buscando_para_viagem?: string | null
          moeda?: string | null
          motivo_perda_comentario?: string | null
          motivo_perda_id?: string | null
          org_id?: string
          origem?: string | null
          origem_lead?: string | null
          parent_card_id?: string | null
          pessoa_principal_id?: string | null
          pipeline_id: string
          pipeline_stage_id?: string | null
          pos_owner_id?: string | null
          prioridade?: string | null
          produto: Database["public"]["Enums"]["app_product"]
          produto_data?: Json | null
          pronto_para_contrato?: boolean | null
          pronto_para_erp?: boolean | null
          receita?: number | null
          receita_source?: string | null
          sdr_owner_id?: string | null
          stage_entered_at?: string | null
          status_comercial?: string
          sub_card_agregado_em?: string | null
          sub_card_category?: string | null
          sub_card_mode?: string | null
          sub_card_status?: string | null
          taxa_alterado_por?: string | null
          taxa_ativa?: boolean | null
          taxa_codigo_transacao?: string | null
          taxa_data_status?: string | null
          taxa_meio_pagamento?: string | null
          taxa_status?: string | null
          taxa_valor?: number | null
          titulo: string
          updated_at?: string | null
          updated_by?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor_estimado?: number | null
          valor_final?: number | null
          valor_proprio?: number | null
          vendas_owner_id?: string | null
        }
        Update: {
          ai_contexto?: string | null
          ai_responsavel?: string | null
          ai_resumo?: string | null
          archived_at?: string | null
          archived_by?: string | null
          briefing_inicial?: Json | null
          campaign_id?: string | null
          card_type?: string | null
          cliente_recorrente?: boolean | null
          codigo_cliente_erp?: string | null
          codigo_projeto_erp?: string | null
          concierge_owner_id?: string | null
          condicoes_pagamento?: string | null
          created_at?: string | null
          created_by?: string | null
          data_fechamento?: string | null
          data_pronto_erp?: string | null
          data_viagem_fim?: string | null
          data_viagem_inicio?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dono_atual_id?: string | null
          duracao_dias_max?: number | null
          duracao_dias_min?: number | null
          epoca_ano?: number | null
          epoca_mes_fim?: number | null
          epoca_mes_inicio?: number | null
          epoca_tipo?: string | null
          estado_operacional?: string | null
          external_id?: string | null
          external_source?: string | null
          forma_pagamento?: string | null
          ganho_planner?: boolean | null
          ganho_planner_at?: string | null
          ganho_pos?: boolean | null
          ganho_pos_at?: string | null
          ganho_sdr?: boolean | null
          ganho_sdr_at?: string | null
          group_capacity?: number | null
          group_total_pax?: number | null
          group_total_revenue?: number | null
          id?: string
          indicado_por_id?: string | null
          is_group_parent?: boolean | null
          locked_fields?: Json | null
          marketing_data?: Json | null
          merge_config?: Json | null
          merge_metadata?: Json | null
          merged_at?: string | null
          merged_by?: string | null
          mkt_buscando_para_viagem?: string | null
          moeda?: string | null
          motivo_perda_comentario?: string | null
          motivo_perda_id?: string | null
          org_id?: string
          origem?: string | null
          origem_lead?: string | null
          parent_card_id?: string | null
          pessoa_principal_id?: string | null
          pipeline_id?: string
          pipeline_stage_id?: string | null
          pos_owner_id?: string | null
          prioridade?: string | null
          produto?: Database["public"]["Enums"]["app_product"]
          produto_data?: Json | null
          pronto_para_contrato?: boolean | null
          pronto_para_erp?: boolean | null
          receita?: number | null
          receita_source?: string | null
          sdr_owner_id?: string | null
          stage_entered_at?: string | null
          status_comercial?: string
          sub_card_agregado_em?: string | null
          sub_card_category?: string | null
          sub_card_mode?: string | null
          sub_card_status?: string | null
          taxa_alterado_por?: string | null
          taxa_ativa?: boolean | null
          taxa_codigo_transacao?: string | null
          taxa_data_status?: string | null
          taxa_meio_pagamento?: string | null
          taxa_status?: string | null
          taxa_valor?: number | null
          titulo?: string
          updated_at?: string | null
          updated_by?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor_estimado?: number | null
          valor_final?: number | null
          valor_proprio?: number | null
          vendas_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_dono_atual_id_profiles_fkey"
            columns: ["dono_atual_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_dono_atual_id_profiles_fkey"
            columns: ["dono_atual_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_dono_atual_id_profiles_fkey"
            columns: ["dono_atual_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_etapa_funil_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_etapa_funil_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "cards_indicado_por_id_fkey"
            columns: ["indicado_por_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_indicado_por_id_fkey"
            columns: ["indicado_por_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "cards_indicado_por_id_fkey"
            columns: ["indicado_por_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_motivo_perda_id_fkey"
            columns: ["motivo_perda_id"]
            isOneToOne: false
            referencedRelation: "motivos_perda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pessoa_principal_id_fkey"
            columns: ["pessoa_principal_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pessoa_principal_id_fkey"
            columns: ["pessoa_principal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "cards_pessoa_principal_id_fkey"
            columns: ["pessoa_principal_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_vendas_owner_id_profiles_fkey"
            columns: ["vendas_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_vendas_owner_id_profiles_fkey"
            columns: ["vendas_owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_vendas_owner_id_profiles_fkey"
            columns: ["vendas_owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      cards_contatos: {
        Row: {
          card_id: string
          contato_id: string
          created_at: string
          id: string
          ordem: number
          org_id: string
          tipo_viajante: Database["public"]["Enums"]["tipo_viajante_enum"]
          tipo_vinculo: string | null
        }
        Insert: {
          card_id: string
          contato_id: string
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string
          tipo_viajante?: Database["public"]["Enums"]["tipo_viajante_enum"]
          tipo_vinculo?: string | null
        }
        Update: {
          card_id?: string
          contato_id?: string
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string
          tipo_viajante?: Database["public"]["Enums"]["tipo_viajante_enum"]
          tipo_vinculo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_contatos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_contatos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_contatos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_contatos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cards_contatos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_contatos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_contatos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "cards_contatos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_contatos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao_taxa_trips: {
        Row: {
          ativo_global: boolean | null
          id: string
          texto_explicativo: string | null
          updated_at: string | null
          updated_by: string | null
          valor_padrao: number | null
        }
        Insert: {
          ativo_global?: boolean | null
          id?: string
          texto_explicativo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_padrao?: number | null
        }
        Update: {
          ativo_global?: boolean | null
          id?: string
          texto_explicativo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_padrao?: number | null
        }
        Relationships: []
      }
      contact_stats: {
        Row: {
          contact_id: string
          is_group_leader: boolean | null
          last_trip_date: string | null
          next_trip_date: string | null
          top_destinations: Json | null
          total_spend: number | null
          total_trips: number | null
          updated_at: string | null
        }
        Insert: {
          contact_id: string
          is_group_leader?: boolean | null
          last_trip_date?: string | null
          next_trip_date?: string | null
          top_destinations?: Json | null
          total_spend?: number | null
          total_trips?: number | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string
          is_group_leader?: boolean | null
          last_trip_date?: string | null
          next_trip_date?: string | null
          top_destinations?: Json | null
          total_spend?: number | null
          total_trips?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_stats_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_stats_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_stats_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contato_meios: {
        Row: {
          contato_id: string
          created_at: string | null
          id: string
          is_principal: boolean | null
          metadata: Json | null
          org_id: string
          origem: string | null
          tipo: string
          updated_at: string | null
          valor: string
          valor_normalizado: string | null
          verificado: boolean | null
          verificado_em: string | null
        }
        Insert: {
          contato_id: string
          created_at?: string | null
          id?: string
          is_principal?: boolean | null
          metadata?: Json | null
          org_id?: string
          origem?: string | null
          tipo: string
          updated_at?: string | null
          valor: string
          valor_normalizado?: string | null
          verificado?: boolean | null
          verificado_em?: string | null
        }
        Update: {
          contato_id?: string
          created_at?: string | null
          id?: string
          is_principal?: boolean | null
          metadata?: Json | null
          org_id?: string
          origem?: string | null
          tipo?: string
          updated_at?: string | null
          valor?: string
          valor_normalizado?: string | null
          verificado?: boolean | null
          verificado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contato_meios_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contato_meios_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contato_meios_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contato_meios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          chatpro_session_id: string | null
          cpf: string | null
          cpf_normalizado: string | null
          created_at: string
          created_by: string | null
          data_cadastro_original: string | null
          data_nascimento: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          endereco: Json | null
          external_id: string | null
          external_source: string | null
          id: string
          last_whatsapp_conversation_id: string | null
          last_whatsapp_sync: string | null
          nome: string
          observacoes: string | null
          org_id: string
          origem: string | null
          origem_detalhe: string | null
          passaporte: string | null
          passaporte_validade: string | null
          primeira_venda_data: string | null
          responsavel_id: string | null
          rg: string | null
          sexo: string | null
          sobrenome: string | null
          tags: string[] | null
          telefone: string | null
          telefone_normalizado: string | null
          tipo_cliente: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa_enum"]
          ultima_venda_data: string | null
          ultimo_retorno_data: string | null
          updated_at: string
        }
        Insert: {
          chatpro_session_id?: string | null
          cpf?: string | null
          cpf_normalizado?: string | null
          created_at?: string
          created_by?: string | null
          data_cadastro_original?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          endereco?: Json | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          last_whatsapp_conversation_id?: string | null
          last_whatsapp_sync?: string | null
          nome: string
          observacoes?: string | null
          org_id?: string
          origem?: string | null
          origem_detalhe?: string | null
          passaporte?: string | null
          passaporte_validade?: string | null
          primeira_venda_data?: string | null
          responsavel_id?: string | null
          rg?: string | null
          sexo?: string | null
          sobrenome?: string | null
          tags?: string[] | null
          telefone?: string | null
          telefone_normalizado?: string | null
          tipo_cliente?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa_enum"]
          ultima_venda_data?: string | null
          ultimo_retorno_data?: string | null
          updated_at?: string
        }
        Update: {
          chatpro_session_id?: string | null
          cpf?: string | null
          cpf_normalizado?: string | null
          created_at?: string
          created_by?: string | null
          data_cadastro_original?: string | null
          data_nascimento?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          endereco?: Json | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          last_whatsapp_conversation_id?: string | null
          last_whatsapp_sync?: string | null
          nome?: string
          observacoes?: string | null
          org_id?: string
          origem?: string | null
          origem_detalhe?: string | null
          passaporte?: string | null
          passaporte_validade?: string | null
          primeira_venda_data?: string | null
          responsavel_id?: string | null
          rg?: string | null
          sexo?: string | null
          sobrenome?: string | null
          tags?: string[] | null
          telefone?: string | null
          telefone_normalizado?: string | null
          tipo_cliente?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa_enum"]
          ultima_venda_data?: string | null
          ultimo_retorno_data?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "contatos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contatos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          card_id: string
          created_at: string | null
          data_assinatura: string | null
          data_criacao: string | null
          data_envio: string | null
          id: string
          moeda: string | null
          nome_contrato: string
          observacoes: string | null
          plataforma: string | null
          responsavel_id: string | null
          status: string | null
          tipo: Database["public"]["Enums"]["app_product"]
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          card_id: string
          created_at?: string | null
          data_assinatura?: string | null
          data_criacao?: string | null
          data_envio?: string | null
          id?: string
          moeda?: string | null
          nome_contrato: string
          observacoes?: string | null
          plataforma?: string | null
          responsavel_id?: string | null
          status?: string | null
          tipo: Database["public"]["Enums"]["app_product"]
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          card_id?: string
          created_at?: string | null
          data_assinatura?: string | null
          data_criacao?: string | null
          data_envio?: string | null
          id?: string
          moeda?: string | null
          nome_contrato?: string
          observacoes?: string | null
          plataforma?: string | null
          responsavel_id?: string | null
          status?: string | null
          tipo?: Database["public"]["Enums"]["app_product"]
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "contratos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      dados_cadastrais_pf: {
        Row: {
          cpf: string | null
          created_at: string | null
          dados_bancarios: string | null
          data_nascimento: string | null
          email_cobranca: string | null
          endereco_completo: string | null
          id: string
          pessoa_id: string
          rg: string | null
          telefone_cobranca: string | null
          updated_at: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string | null
          dados_bancarios?: string | null
          data_nascimento?: string | null
          email_cobranca?: string | null
          endereco_completo?: string | null
          id?: string
          pessoa_id: string
          rg?: string | null
          telefone_cobranca?: string | null
          updated_at?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string | null
          dados_bancarios?: string | null
          data_nascimento?: string | null
          email_cobranca?: string | null
          endereco_completo?: string | null
          id?: string
          pessoa_id?: string
          rg?: string | null
          telefone_cobranca?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dados_cadastrais_pj: {
        Row: {
          card_id: string
          cnpj: string | null
          contato_financeiro_email: string | null
          contato_financeiro_nome: string | null
          contato_financeiro_telefone: string | null
          created_at: string | null
          endereco_cobranca: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          razao_social: string | null
          updated_at: string | null
        }
        Insert: {
          card_id: string
          cnpj?: string | null
          contato_financeiro_email?: string | null
          contato_financeiro_nome?: string | null
          contato_financeiro_telefone?: string | null
          created_at?: string | null
          endereco_cobranca?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          updated_at?: string | null
        }
        Update: {
          card_id?: string
          cnpj?: string | null
          contato_financeiro_email?: string | null
          contato_financeiro_nome?: string | null
          contato_financeiro_telefone?: string | null
          created_at?: string | null
          endereco_cobranca?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dados_cadastrais_pj_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dados_cadastrais_pj_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dados_cadastrais_pj_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dados_cadastrais_pj_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "dados_cadastrais_pj_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id?: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          avg_budget_per_person: number | null
          avg_trip_duration: number | null
          continent: string | null
          country: string
          cover_image_url: string | null
          created_at: string | null
          currency: string | null
          gallery_urls: string[] | null
          id: string
          language: string | null
          name: string
          org_id: string
          popular_months: number[] | null
          region: string | null
          thumbnail_url: string | null
          timezone: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          avg_budget_per_person?: number | null
          avg_trip_duration?: number | null
          continent?: string | null
          country: string
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          gallery_urls?: string[] | null
          id?: string
          language?: string | null
          name: string
          org_id?: string
          popular_months?: number[] | null
          region?: string | null
          thumbnail_url?: string | null
          timezone?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          avg_budget_per_person?: number | null
          avg_trip_duration?: number | null
          continent?: string | null
          country?: string
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          gallery_urls?: string[] | null
          id?: string
          language?: string | null
          name?: string
          org_id?: string
          popular_months?: number[] | null
          region?: string | null
          thumbnail_url?: string | null
          timezone?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "destinations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          ativo: boolean
          campo_contato: string | null
          created_at: string
          created_by: string | null
          data_field_label: string | null
          descricao: string | null
          has_data_field: boolean
          id: string
          nome: string
          ordem: number
          requires_file: boolean
          slug: string
        }
        Insert: {
          ativo?: boolean
          campo_contato?: string | null
          created_at?: string
          created_by?: string | null
          data_field_label?: string | null
          descricao?: string | null
          has_data_field?: boolean
          id?: string
          nome: string
          ordem?: number
          requires_file?: boolean
          slug: string
        }
        Update: {
          ativo?: boolean
          campo_contato?: string | null
          created_at?: string
          created_by?: string | null
          data_field_label?: string | null
          descricao?: string | null
          has_data_field?: boolean
          id?: string
          nome?: string
          ordem?: number
          requires_file?: boolean
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "document_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      external_refs: {
        Row: {
          business_unit: string
          created_at: string | null
          entity_type: string
          external_id: string
          id: string
          internal_id: string
          metadata: Json | null
          source: string
          updated_at: string | null
        }
        Insert: {
          business_unit?: string
          created_at?: string | null
          entity_type: string
          external_id: string
          id?: string
          internal_id: string
          metadata?: Json | null
          source?: string
          updated_at?: string | null
        }
        Update: {
          business_unit?: string
          created_at?: string | null
          entity_type?: string
          external_id?: string
          id?: string
          internal_id?: string
          metadata?: Json | null
          source?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_item_passengers: {
        Row: {
          card_id: string
          concluido_em: string | null
          concluido_por: string | null
          created_at: string | null
          financial_item_id: string
          id: string
          nome: string
          observacao: string | null
          ordem: number | null
          status: string | null
        }
        Insert: {
          card_id: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string | null
          financial_item_id: string
          id?: string
          nome: string
          observacao?: string | null
          ordem?: number | null
          status?: string | null
        }
        Update: {
          card_id?: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string | null
          financial_item_id?: string
          id?: string
          nome?: string
          observacao?: string | null
          ordem?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_item_passengers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_item_passengers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_item_passengers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_item_passengers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "financial_item_passengers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_item_passengers_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_item_passengers_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "financial_item_passengers_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_item_passengers_financial_item_id_fkey"
            columns: ["financial_item_id"]
            isOneToOne: false
            referencedRelation: "card_financial_items"
            referencedColumns: ["id"]
          },
        ]
      }
      future_opportunities: {
        Row: {
          cancelled_at: string | null
          created_at: string | null
          created_by: string | null
          created_card_id: string | null
          descricao: string | null
          executed_at: string | null
          id: string
          metadata: Json | null
          org_id: string
          pessoa_principal_id: string | null
          pipeline_id: string | null
          produto: string | null
          responsavel_id: string | null
          scheduled_date: string
          source_card_id: string
          source_type: string
          status: string
          sub_card_mode: string | null
          titulo: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_card_id?: string | null
          descricao?: string | null
          executed_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          pessoa_principal_id?: string | null
          pipeline_id?: string | null
          produto?: string | null
          responsavel_id?: string | null
          scheduled_date: string
          source_card_id: string
          source_type: string
          status?: string
          sub_card_mode?: string | null
          titulo: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_card_id?: string | null
          descricao?: string | null
          executed_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          pessoa_principal_id?: string | null
          pipeline_id?: string | null
          produto?: string | null
          responsavel_id?: string | null
          scheduled_date?: string
          source_card_id?: string
          source_type?: string
          status?: string
          sub_card_mode?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "future_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "future_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_created_card_id_fkey"
            columns: ["created_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_created_card_id_fkey"
            columns: ["created_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_created_card_id_fkey"
            columns: ["created_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_created_card_id_fkey"
            columns: ["created_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "future_opportunities_created_card_id_fkey"
            columns: ["created_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "future_opportunities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "future_opportunities_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "future_opportunities_source_card_id_fkey"
            columns: ["source_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_fases: {
        Row: {
          card_id: string
          data_mudanca: string | null
          etapa_anterior_id: string | null
          etapa_nova_id: string
          id: string
          mudado_por: string | null
          org_id: string
          tempo_na_etapa_anterior: string | null
        }
        Insert: {
          card_id: string
          data_mudanca?: string | null
          etapa_anterior_id?: string | null
          etapa_nova_id: string
          id?: string
          mudado_por?: string | null
          org_id?: string
          tempo_na_etapa_anterior?: string | null
        }
        Update: {
          card_id?: string
          data_mudanca?: string | null
          etapa_anterior_id?: string | null
          etapa_nova_id?: string
          id?: string
          mudado_por?: string | null
          org_id?: string
          tempo_na_etapa_anterior?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_fases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "historico_fases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fases_etapa_anterior_id_fkey"
            columns: ["etapa_anterior_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fases_etapa_anterior_id_fkey"
            columns: ["etapa_anterior_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "historico_fases_etapa_nova_id_fkey"
            columns: ["etapa_nova_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fases_etapa_nova_id_fkey"
            columns: ["etapa_nova_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "historico_fases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog: {
        Row: {
          created_at: string | null
          entity_type: string
          external_id: string
          external_name: string
          id: string
          integration_id: string
          metadata: Json | null
          parent_external_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          external_id: string
          external_name: string
          id?: string
          integration_id: string
          metadata?: Json | null
          parent_external_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          external_id?: string
          external_name?: string
          id?: string
          integration_id?: string
          metadata?: Json | null
          parent_external_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_catalog_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_conflict_log: {
        Row: {
          actual_stage_id: string | null
          card_id: string | null
          conflict_type: string
          created_at: string | null
          event_id: string | null
          id: string
          integration_id: string | null
          missing_requirements: Json
          notes: string | null
          resolution: string
          resolved_at: string | null
          resolved_by: string | null
          target_stage_id: string | null
          trigger_id: string | null
        }
        Insert: {
          actual_stage_id?: string | null
          card_id?: string | null
          conflict_type: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          integration_id?: string | null
          missing_requirements?: Json
          notes?: string | null
          resolution: string
          resolved_at?: string | null
          resolved_by?: string | null
          target_stage_id?: string | null
          trigger_id?: string | null
        }
        Update: {
          actual_stage_id?: string | null
          card_id?: string | null
          conflict_type?: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          integration_id?: string | null
          missing_requirements?: Json
          notes?: string | null
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
          target_stage_id?: string | null
          trigger_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_conflict_log_actual_stage_id_fkey"
            columns: ["actual_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_actual_stage_id_fkey"
            columns: ["actual_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "integration_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "view_integration_classification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "integration_conflict_log_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "integration_inbound_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          attempts: number
          created_at: string
          entity_type: string | null
          event_type: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          integration_id: string
          logs: Json | null
          matched_trigger_id: string | null
          next_retry_at: string | null
          payload: Json | null
          processed_at: string | null
          processing_log: string | null
          response: Json | null
          row_key: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_type?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          integration_id: string
          logs?: Json | null
          matched_trigger_id?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_log?: string | null
          response?: Json | null
          row_key?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_type?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string
          logs?: Json | null
          matched_trigger_id?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_log?: string | null
          response?: Json | null
          row_key?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_events_matched_trigger_id_fkey"
            columns: ["matched_trigger_id"]
            isOneToOne: false
            referencedRelation: "integration_inbound_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_field_catalog: {
        Row: {
          created_at: string | null
          direction: string
          field_key: string
          field_name: string
          field_type: string | null
          id: string
          integration_id: string | null
          is_required: boolean | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          direction: string
          field_key: string
          field_name: string
          field_type?: string | null
          id?: string
          integration_id?: string | null
          is_required?: boolean | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          field_key?: string
          field_name?: string
          field_type?: string | null
          id?: string
          integration_id?: string | null
          is_required?: boolean | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_field_catalog_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_field_map: {
        Row: {
          db_column_name: string | null
          direction: string | null
          entity_type: string
          external_field_id: string
          external_pipeline_id: string | null
          id: string
          integration_id: string | null
          is_active: boolean | null
          local_field_key: string
          org_id: string
          section: string | null
          source: string
          storage_location: string | null
          sync_always: boolean | null
          updated_at: string | null
        }
        Insert: {
          db_column_name?: string | null
          direction?: string | null
          entity_type: string
          external_field_id: string
          external_pipeline_id?: string | null
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          local_field_key: string
          org_id?: string
          section?: string | null
          source?: string
          storage_location?: string | null
          sync_always?: boolean | null
          updated_at?: string | null
        }
        Update: {
          db_column_name?: string | null
          direction?: string | null
          entity_type?: string
          external_field_id?: string
          external_pipeline_id?: string | null
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          local_field_key?: string
          org_id?: string
          section?: string | null
          source?: string
          storage_location?: string | null
          sync_always?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_field_map_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_field_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          context: Json
          created_at: string
          fired_at: string
          id: string
          resolved_at: string | null
          rule_id: string
          rule_key: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          context?: Json
          created_at?: string
          fired_at?: string
          id?: string
          resolved_at?: string | null
          rule_id: string
          rule_key: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          context?: Json
          created_at?: string
          fired_at?: string
          id?: string
          resolved_at?: string | null
          rule_id?: string
          rule_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_health_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "integration_health_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_health_alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "integration_health_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_pulse: {
        Row: {
          channel: string
          error_count_24h: number | null
          event_count_24h: number | null
          event_count_7d: number | null
          label: string
          last_error_at: string | null
          last_event_at: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          error_count_24h?: number | null
          event_count_24h?: number | null
          event_count_7d?: number | null
          label: string
          last_error_at?: string | null
          last_event_at?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          error_count_24h?: number | null
          event_count_24h?: number | null
          event_count_7d?: number | null
          label?: string
          last_error_at?: string | null
          last_event_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_health_rules: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          label: string
          rule_key: string
          severity: string
          threshold_count: number | null
          threshold_hours: number
          threshold_percent: number | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          label: string
          rule_key: string
          severity?: string
          threshold_count?: number | null
          threshold_hours?: number
          threshold_percent?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          label?: string
          rule_key?: string
          severity?: string
          threshold_count?: number | null
          threshold_hours?: number
          threshold_percent?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_inbound_triggers: {
        Row: {
          action_type: string
          bypass_validation: boolean | null
          created_at: string
          description: string | null
          entity_types: string[]
          external_owner_ids: string[] | null
          external_pipeline_id: string
          external_pipeline_ids: string[] | null
          external_stage_id: string
          external_stage_ids: string[] | null
          id: string
          integration_id: string
          is_active: boolean
          name: string | null
          org_id: string
          quarantine_mode: string | null
          quarantine_stage_id: string | null
          target_pipeline_id: string | null
          target_stage_id: string | null
          updated_at: string
          validation_level: string | null
        }
        Insert: {
          action_type?: string
          bypass_validation?: boolean | null
          created_at?: string
          description?: string | null
          entity_types?: string[]
          external_owner_ids?: string[] | null
          external_pipeline_id: string
          external_pipeline_ids?: string[] | null
          external_stage_id: string
          external_stage_ids?: string[] | null
          id?: string
          integration_id: string
          is_active?: boolean
          name?: string | null
          org_id?: string
          quarantine_mode?: string | null
          quarantine_stage_id?: string | null
          target_pipeline_id?: string | null
          target_stage_id?: string | null
          updated_at?: string
          validation_level?: string | null
        }
        Update: {
          action_type?: string
          bypass_validation?: boolean | null
          created_at?: string
          description?: string | null
          entity_types?: string[]
          external_owner_ids?: string[] | null
          external_pipeline_id?: string
          external_pipeline_ids?: string[] | null
          external_stage_id?: string
          external_stage_ids?: string[] | null
          id?: string
          integration_id?: string
          is_active?: boolean
          name?: string | null
          org_id?: string
          quarantine_mode?: string | null
          quarantine_stage_id?: string | null
          target_pipeline_id?: string | null
          target_stage_id?: string | null
          updated_at?: string
          validation_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_inbound_triggers_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_triggers_quarantine_stage_id_fkey"
            columns: ["quarantine_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_triggers_quarantine_stage_id_fkey"
            columns: ["quarantine_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "integration_inbound_triggers_target_pipeline_id_fkey"
            columns: ["target_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_triggers_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_inbound_triggers_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      integration_outbound_field_map: {
        Row: {
          created_at: string | null
          external_field_id: string
          external_field_name: string | null
          external_pipeline_id: string | null
          id: string
          integration_id: string | null
          internal_field: string
          internal_field_label: string | null
          is_active: boolean | null
          section: string | null
          sync_always: boolean | null
          sync_on_phases: string[] | null
          transform_type: string | null
          updated_at: string | null
          value_map: Json | null
        }
        Insert: {
          created_at?: string | null
          external_field_id: string
          external_field_name?: string | null
          external_pipeline_id?: string | null
          id?: string
          integration_id?: string | null
          internal_field: string
          internal_field_label?: string | null
          is_active?: boolean | null
          section?: string | null
          sync_always?: boolean | null
          sync_on_phases?: string[] | null
          transform_type?: string | null
          updated_at?: string | null
          value_map?: Json | null
        }
        Update: {
          created_at?: string | null
          external_field_id?: string
          external_field_name?: string | null
          external_pipeline_id?: string | null
          id?: string
          integration_id?: string | null
          internal_field?: string
          internal_field_label?: string | null
          is_active?: boolean | null
          section?: string | null
          sync_always?: boolean | null
          sync_on_phases?: string[] | null
          transform_type?: string | null
          updated_at?: string | null
          value_map?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbound_field_map_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_outbound_queue: {
        Row: {
          attempts: number | null
          card_id: string | null
          created_at: string | null
          event_type: string
          external_id: string | null
          id: string
          integration_id: string | null
          matched_trigger_id: string | null
          max_attempts: number | null
          next_retry_at: string | null
          org_id: string
          payload: Json
          processed_at: string | null
          processing_log: string | null
          response_data: Json | null
          status: string | null
          tarefa_id: string | null
          triggered_by: string | null
        }
        Insert: {
          attempts?: number | null
          card_id?: string | null
          created_at?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          integration_id?: string | null
          matched_trigger_id?: string | null
          max_attempts?: number | null
          next_retry_at?: string | null
          org_id?: string
          payload: Json
          processed_at?: string | null
          processing_log?: string | null
          response_data?: Json | null
          status?: string | null
          tarefa_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          attempts?: number | null
          card_id?: string | null
          created_at?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          integration_id?: string | null
          matched_trigger_id?: string | null
          max_attempts?: number | null
          next_retry_at?: string | null
          org_id?: string
          payload?: Json
          processed_at?: string | null
          processing_log?: string | null
          response_data?: Json | null
          status?: string | null
          tarefa_id?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbound_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_matched_trigger_id_fkey"
            columns: ["matched_trigger_id"]
            isOneToOne: false
            referencedRelation: "integration_outbound_triggers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_queue_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "view_agenda"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_outbound_stage_map: {
        Row: {
          created_at: string | null
          external_stage_id: string
          external_stage_name: string | null
          id: string
          integration_id: string | null
          internal_stage_id: string | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          external_stage_id: string
          external_stage_name?: string | null
          id?: string
          integration_id?: string | null
          internal_stage_id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          external_stage_id?: string
          external_stage_name?: string | null
          id?: string
          integration_id?: string | null
          internal_stage_id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbound_stage_map_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_stage_map_internal_stage_id_fkey"
            columns: ["internal_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_stage_map_internal_stage_id_fkey"
            columns: ["internal_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      integration_outbound_triggers: {
        Row: {
          action_mode: string | null
          action_type: string | null
          created_at: string | null
          description: string | null
          event_types: string[] | null
          id: string
          integration_id: string | null
          is_active: boolean | null
          name: string
          org_id: string
          priority: number | null
          source_owner_ids: string[] | null
          source_pipeline_ids: string[] | null
          source_stage_ids: string[] | null
          source_status: string[] | null
          sync_field_mode: string | null
          sync_fields: string[] | null
          updated_at: string | null
        }
        Insert: {
          action_mode?: string | null
          action_type?: string | null
          created_at?: string | null
          description?: string | null
          event_types?: string[] | null
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          name: string
          org_id?: string
          priority?: number | null
          source_owner_ids?: string[] | null
          source_pipeline_ids?: string[] | null
          source_stage_ids?: string[] | null
          source_status?: string[] | null
          sync_field_mode?: string | null
          sync_fields?: string[] | null
          updated_at?: string | null
        }
        Update: {
          action_mode?: string | null
          action_type?: string | null
          created_at?: string | null
          description?: string | null
          event_types?: string[] | null
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          name?: string
          org_id?: string
          priority?: number | null
          source_owner_ids?: string[] | null
          source_pipeline_ids?: string[] | null
          source_stage_ids?: string[] | null
          source_status?: string[] | null
          sync_field_mode?: string | null
          sync_fields?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_outbound_triggers_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_outbound_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_outbox: {
        Row: {
          action: string
          created_at: string | null
          destination: string
          entity_type: string
          error_log: string | null
          id: string
          internal_id: string
          payload: Json
          retry_count: number | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string | null
          destination?: string
          entity_type: string
          error_log?: string | null
          id?: string
          internal_id: string
          payload: Json
          retry_count?: number | null
          status?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          destination?: string
          entity_type?: string
          error_log?: string | null
          id?: string
          internal_id?: string
          payload?: Json
          retry_count?: number | null
          status?: string
        }
        Relationships: []
      }
      integration_provider_catalog: {
        Row: {
          builder_type: string
          category: string
          color: string | null
          config_schema: Json | null
          created_at: string | null
          description: string | null
          direction: string[]
          documentation_url: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          is_beta: boolean | null
          is_premium: boolean | null
          logo_url: string | null
          name: string
          required_credentials: string[] | null
          setup_guide: string | null
          slug: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          builder_type?: string
          category: string
          color?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          direction?: string[]
          documentation_url?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_beta?: boolean | null
          is_premium?: boolean | null
          logo_url?: string | null
          name: string
          required_credentials?: string[] | null
          setup_guide?: string | null
          slug: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          builder_type?: string
          category?: string
          color?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          direction?: string[]
          documentation_url?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          is_beta?: boolean | null
          is_premium?: boolean | null
          logo_url?: string | null
          name?: string
          required_credentials?: string[] | null
          setup_guide?: string | null
          slug?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integration_router_config: {
        Row: {
          ac_pipeline_id: string
          business_unit: string
          created_at: string | null
          description: string | null
          external_list_id: string | null
          external_pipeline_id: string | null
          integration_id: string | null
          internal_pipeline_id: string | null
          is_active: boolean | null
          pipeline_id: string | null
          target_pipeline_id: string | null
        }
        Insert: {
          ac_pipeline_id: string
          business_unit: string
          created_at?: string | null
          description?: string | null
          external_list_id?: string | null
          external_pipeline_id?: string | null
          integration_id?: string | null
          internal_pipeline_id?: string | null
          is_active?: boolean | null
          pipeline_id?: string | null
          target_pipeline_id?: string | null
        }
        Update: {
          ac_pipeline_id?: string
          business_unit?: string
          created_at?: string | null
          description?: string | null
          external_list_id?: string | null
          external_pipeline_id?: string | null
          integration_id?: string | null
          internal_pipeline_id?: string | null
          is_active?: boolean | null
          pipeline_id?: string | null
          target_pipeline_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_router_config_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_router_config_internal_pipeline_id_fkey"
            columns: ["internal_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_router_config_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          description: string | null
          key: string
          org_id: string
          produto: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          org_id?: string
          produto?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          org_id?: string
          produto?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_stage_map: {
        Row: {
          created_at: string | null
          direction: string | null
          external_stage_id: string
          external_stage_name: string
          id: string
          integration_id: string
          internal_stage_id: string
          label: string | null
          org_id: string
          pipeline_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string | null
          external_stage_id: string
          external_stage_name: string
          id?: string
          integration_id: string
          internal_stage_id: string
          label?: string | null
          org_id?: string
          pipeline_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string | null
          external_stage_id?: string
          external_stage_name?: string
          id?: string
          integration_id?: string
          internal_stage_id?: string
          label?: string | null
          org_id?: string
          pipeline_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_stage_map_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_stage_map_internal_stage_id_fkey"
            columns: ["internal_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_stage_map_internal_stage_id_fkey"
            columns: ["internal_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "integration_stage_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_task_sync_config: {
        Row: {
          created_at: string | null
          id: string
          inbound_enabled: boolean | null
          integration_id: string | null
          outbound_enabled: boolean | null
          pipeline_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inbound_enabled?: boolean | null
          integration_id?: string | null
          outbound_enabled?: boolean | null
          pipeline_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inbound_enabled?: boolean | null
          integration_id?: string | null
          outbound_enabled?: boolean | null
          pipeline_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_task_sync_config_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_task_sync_config_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_task_type_map: {
        Row: {
          ac_task_type: number
          created_at: string | null
          crm_task_tipo: string
          id: string
          integration_id: string | null
          is_active: boolean | null
          pipeline_id: string | null
          sync_direction: string
        }
        Insert: {
          ac_task_type: number
          created_at?: string | null
          crm_task_tipo: string
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          pipeline_id?: string | null
          sync_direction?: string
        }
        Update: {
          ac_task_type?: number
          created_at?: string | null
          crm_task_tipo?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          pipeline_id?: string | null
          sync_direction?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_task_type_map_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_task_type_map_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_user_map: {
        Row: {
          created_at: string | null
          direction: string | null
          external_user_id: string
          id: string
          integration_id: string
          internal_user_id: string
          label: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string | null
          external_user_id: string
          id?: string
          integration_id: string
          internal_user_id: string
          label?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string | null
          external_user_id?: string
          id?: string
          integration_id?: string
          internal_user_id?: string
          label?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_user_map_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_user_map_internal_user_id_fkey"
            columns: ["internal_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_user_map_internal_user_id_fkey"
            columns: ["internal_user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "integration_user_map_internal_user_id_fkey"
            columns: ["internal_user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          provider: string
          transformer_rules: Json
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          provider?: string
          transformer_rules?: Json
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          provider?: string
          transformer_rules?: Json
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string | null
          id: string
          movement_type: string
          performed_by: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          movement_type: string
          performed_by?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          movement_type?: string
          performed_by?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "inventory_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          active: boolean
          category: string
          created_at: string | null
          created_by: string | null
          current_stock: number
          description: string | null
          id: string
          image_path: string | null
          low_stock_threshold: number
          name: string
          sku: string
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string | null
          created_by?: string | null
          current_stock?: number
          description?: string | null
          id?: string
          image_path?: string | null
          low_stock_threshold?: number
          name: string
          sku: string
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string | null
          created_by?: string | null
          current_stock?: number
          description?: string | null
          id?: string
          image_path?: string | null
          low_stock_threshold?: number
          name?: string
          sku?: string
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "inventory_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          org_id: string
          produtos: string[] | null
          role: string
          team_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          org_id?: string
          produtos?: string[] | null
          role: string
          team_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          produtos?: string[] | null
          role?: string
          team_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["team_id"]
          },
        ]
      }
      mensagens: {
        Row: {
          assunto: string | null
          canal: string
          card_id: string
          conteudo: string | null
          created_at: string | null
          data_hora: string | null
          id: string
          lado: string
          metadados: Json | null
          org_id: string
          pessoa_id: string | null
          remetente_interno_id: string | null
        }
        Insert: {
          assunto?: string | null
          canal: string
          card_id: string
          conteudo?: string | null
          created_at?: string | null
          data_hora?: string | null
          id?: string
          lado: string
          metadados?: Json | null
          org_id?: string
          pessoa_id?: string | null
          remetente_interno_id?: string | null
        }
        Update: {
          assunto?: string | null
          canal?: string
          card_id?: string
          conteudo?: string | null
          created_at?: string | null
          data_hora?: string | null
          id?: string
          lado?: string
          metadados?: Json | null
          org_id?: string
          pessoa_id?: string | null
          remetente_interno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "mensagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monde_import_log_items: {
        Row: {
          card_id: string
          card_title: string
          created_at: string
          error_message: string | null
          id: string
          import_log_id: string
          products_count: number
          status: string
          total_receita: number
          total_venda: number
          venda_num: string
        }
        Insert: {
          card_id: string
          card_title: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_log_id: string
          products_count?: number
          status?: string
          total_receita?: number
          total_venda?: number
          venda_num: string
        }
        Update: {
          card_id?: string
          card_title?: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_log_id?: string
          products_count?: number
          status?: string
          total_receita?: number
          total_venda?: number
          venda_num?: string
        }
        Relationships: [
          {
            foreignKeyName: "monde_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "monde_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_import_log_items_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "monde_import_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      monde_import_logs: {
        Row: {
          created_at: string
          created_by: string
          error_message: string | null
          file_name: string
          id: string
          matched_cards: number
          products_imported: number
          status: string
          total_rows: number
          unmatched_vendas: number
        }
        Insert: {
          created_at?: string
          created_by: string
          error_message?: string | null
          file_name: string
          id?: string
          matched_cards?: number
          products_imported?: number
          status?: string
          total_rows?: number
          unmatched_vendas?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          error_message?: string | null
          file_name?: string
          id?: string
          matched_cards?: number
          products_imported?: number
          status?: string
          total_rows?: number
          unmatched_vendas?: number
        }
        Relationships: [
          {
            foreignKeyName: "monde_import_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_import_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "monde_import_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      monde_sale_items: {
        Row: {
          card_financial_item_id: string | null
          created_at: string
          description: string | null
          id: string
          item_metadata: Json | null
          item_type: string
          proposal_flight_id: string | null
          proposal_item_id: string | null
          quantity: number
          sale_id: string
          service_date_end: string | null
          service_date_start: string | null
          supplier: string | null
          title: string
          total_price: number
          unit_price: number
        }
        Insert: {
          card_financial_item_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_metadata?: Json | null
          item_type: string
          proposal_flight_id?: string | null
          proposal_item_id?: string | null
          quantity?: number
          sale_id: string
          service_date_end?: string | null
          service_date_start?: string | null
          supplier?: string | null
          title: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          card_financial_item_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_metadata?: Json | null
          item_type?: string
          proposal_flight_id?: string | null
          proposal_item_id?: string | null
          quantity?: number
          sale_id?: string
          service_date_end?: string | null
          service_date_start?: string | null
          supplier?: string | null
          title?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "monde_sale_items_card_financial_item_id_fkey"
            columns: ["card_financial_item_id"]
            isOneToOne: false
            referencedRelation: "card_financial_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sale_items_proposal_flight_id_fkey"
            columns: ["proposal_flight_id"]
            isOneToOne: false
            referencedRelation: "proposal_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sale_items_proposal_item_id_fkey"
            columns: ["proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "monde_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_monde_sent_items"
            referencedColumns: ["sale_id"]
          },
        ]
      }
      monde_sales: {
        Row: {
          attempts: number
          attempts_log: Json | null
          card_id: string
          created_at: string
          created_by: string
          currency: string
          error_message: string | null
          id: string
          idempotency_key: string
          max_attempts: number
          monde_response: Json | null
          monde_sale_id: string | null
          monde_sale_number: string | null
          next_retry_at: string | null
          proposal_id: string | null
          sale_date: string
          sent_at: string | null
          status: string
          total_value: number
          travel_end_date: string | null
          travel_start_date: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          attempts_log?: Json | null
          card_id: string
          created_at?: string
          created_by: string
          currency?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          max_attempts?: number
          monde_response?: Json | null
          monde_sale_id?: string | null
          monde_sale_number?: string | null
          next_retry_at?: string | null
          proposal_id?: string | null
          sale_date: string
          sent_at?: string | null
          status?: string
          total_value?: number
          travel_end_date?: string | null
          travel_start_date?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          attempts_log?: Json | null
          card_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          max_attempts?: number
          monde_response?: Json | null
          monde_sale_id?: string | null
          monde_sale_number?: string | null
          next_retry_at?: string | null
          proposal_id?: string | null
          sale_date?: string
          sent_at?: string | null
          status?: string
          total_value?: number
          travel_end_date?: string | null
          travel_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "monde_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "monde_sales_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_perda: {
        Row: {
          ativo: boolean | null
          id: string
          nome: string
          org_id: string
          produto: string | null
        }
        Insert: {
          ativo?: boolean | null
          id?: string
          nome: string
          org_id?: string
          produto?: string | null
        }
        Update: {
          ativo?: boolean | null
          id?: string
          nome?: string
          org_id?: string
          produto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motivos_perda_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_ai_extraction_queue: {
        Row: {
          card_id: string
          created_at: string | null
          first_message_at: string | null
          id: string
          last_message_at: string | null
          message_count: number | null
          scheduled_for: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          card_id: string
          created_at?: string | null
          first_message_at?: string | null
          id?: string
          last_message_at?: string | null
          message_count?: number | null
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          card_id?: string
          created_at?: string | null
          first_message_at?: string | null
          id?: string
          last_message_at?: string | null
          message_count?: number | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "n8n_ai_extraction_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "n8n_ai_extraction_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "n8n_ai_extraction_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "n8n_ai_extraction_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "n8n_ai_extraction_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_type_config: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          enabled: boolean | null
          icon: string
          id: string
          label: string
          org_id: string
          type_key: string
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          icon?: string
          id?: string
          label: string
          org_id?: string
          type_key: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          icon?: string
          id?: string
          label?: string
          org_id?: string
          type_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_type_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          card_id: string | null
          created_at: string | null
          id: string
          org_id: string
          read: boolean | null
          title: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          card_id?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          read?: boolean | null
          title: string
          type?: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          card_id?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          read?: boolean | null
          title?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      organizations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      participacoes: {
        Row: {
          card_id: string
          created_at: string | null
          id: string
          observacoes: string | null
          papel: string
          pessoa_id: string
        }
        Insert: {
          card_id: string
          created_at?: string | null
          id?: string
          observacoes?: string | null
          papel: string
          pessoa_id: string
        }
        Update: {
          card_id?: string
          created_at?: string | null
          id?: string
          observacoes?: string | null
          papel?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participacoes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacoes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacoes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacoes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "participacoes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_visibility_rules: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          source_phase_id: string
          target_phase_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id?: string
          source_phase_id: string
          target_phase_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          source_phase_id?: string
          target_phase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_visibility_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_visibility_rules_source_phase_id_fkey"
            columns: ["source_phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_visibility_rules_target_phase_id_fkey"
            columns: ["target_phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_card_settings: {
        Row: {
          campos_kanban: Json
          campos_visiveis: Json | null
          created_at: string | null
          fase: string
          id: string
          ordem_campos: Json | null
          ordem_kanban: Json
          org_id: string
          phase_id: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          campos_kanban?: Json
          campos_visiveis?: Json | null
          created_at?: string | null
          fase: string
          id?: string
          ordem_campos?: Json | null
          ordem_kanban?: Json
          org_id?: string
          phase_id?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          campos_kanban?: Json
          campos_visiveis?: Json | null
          created_at?: string | null
          fase?: string
          id?: string
          ordem_campos?: Json | null
          ordem_kanban?: Json
          org_id?: string
          phase_id?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_card_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_card_settings_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_card_settings_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_card_settings_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "pipeline_card_settings_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_config: {
        Row: {
          actions: Json | null
          ativo: boolean | null
          conditions: Json | null
          config_type: string
          created_at: string | null
          from_stage_id: string | null
          id: string
          pipeline_id: string
          to_stage_id: string | null
          updated_at: string | null
        }
        Insert: {
          actions?: Json | null
          ativo?: boolean | null
          conditions?: Json | null
          config_type: string
          created_at?: string | null
          from_stage_id?: string | null
          id?: string
          pipeline_id: string
          to_stage_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json | null
          ativo?: boolean | null
          conditions?: Json | null
          config_type?: string
          created_at?: string | null
          from_stage_id?: string | null
          id?: string
          pipeline_id?: string
          to_stage_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_config_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_config_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "pipeline_config_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_config_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_config_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      pipeline_phases: {
        Row: {
          active: boolean
          color: string
          created_at: string | null
          id: string
          label: string
          name: string
          order_index: number
          org_id: string
          slug: string | null
          updated_at: string | null
          visible_in_card: boolean | null
        }
        Insert: {
          active?: boolean
          color: string
          created_at?: string | null
          id?: string
          label: string
          name: string
          order_index?: number
          org_id?: string
          slug?: string | null
          updated_at?: string | null
          visible_in_card?: boolean | null
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string | null
          id?: string
          label?: string
          name?: string
          order_index?: number
          org_id?: string
          slug?: string | null
          updated_at?: string | null
          visible_in_card?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_phases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          ativo: boolean | null
          auto_advance: boolean
          description: string | null
          fase: string | null
          id: string
          is_frozen: boolean | null
          is_lost: boolean | null
          is_planner_won: boolean | null
          is_pos_won: boolean | null
          is_sdr_won: boolean | null
          is_won: boolean | null
          milestone_key: string | null
          nome: string
          ordem: number
          org_id: string
          phase_id: string | null
          pipeline_id: string
          sla_hours: number | null
          target_phase_id: string | null
          target_role: string | null
          tipo_responsavel: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          ativo?: boolean | null
          auto_advance?: boolean
          description?: string | null
          fase?: string | null
          id?: string
          is_frozen?: boolean | null
          is_lost?: boolean | null
          is_planner_won?: boolean | null
          is_pos_won?: boolean | null
          is_sdr_won?: boolean | null
          is_won?: boolean | null
          milestone_key?: string | null
          nome: string
          ordem: number
          org_id?: string
          phase_id?: string | null
          pipeline_id: string
          sla_hours?: number | null
          target_phase_id?: string | null
          target_role?: string | null
          tipo_responsavel?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          ativo?: boolean | null
          auto_advance?: boolean
          description?: string | null
          fase?: string | null
          id?: string
          is_frozen?: boolean | null
          is_lost?: boolean | null
          is_planner_won?: boolean | null
          is_pos_won?: boolean | null
          is_sdr_won?: boolean | null
          is_won?: boolean | null
          milestone_key?: string | null
          nome?: string
          ordem?: number
          org_id?: string
          phase_id?: string | null
          pipeline_id?: string
          sla_hours?: number | null
          target_phase_id?: string | null
          target_role?: string | null
          tipo_responsavel?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_target_phase_id_fkey"
            columns: ["target_phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          org_id: string
          produto: Database["public"]["Enums"]["app_product"]
          sub_card_default_stage_id: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          org_id?: string
          produto: Database["public"]["Enums"]["app_product"]
          sub_card_default_stage_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string
          produto?: Database["public"]["Enums"]["app_product"]
          sub_card_default_stage_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_sub_card_default_stage_id_fkey"
            columns: ["sub_card_default_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_sub_card_default_stage_id_fkey"
            columns: ["sub_card_default_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      pos_venda_import_log_items: {
        Row: {
          action: string
          card_id: string | null
          card_title: string | null
          cpf: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          error_message: string | null
          id: string
          import_log_id: string
          pagante: string | null
          previous_state: Json | null
          products_count: number
          reverted_at: string | null
          reverted_by: string | null
          stage_name: string | null
          total_receita: number
          total_venda: number
          venda_nums: string[] | null
        }
        Insert: {
          action: string
          card_id?: string | null
          card_title?: string | null
          cpf?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          error_message?: string | null
          id?: string
          import_log_id: string
          pagante?: string | null
          previous_state?: Json | null
          products_count?: number
          reverted_at?: string | null
          reverted_by?: string | null
          stage_name?: string | null
          total_receita?: number
          total_venda?: number
          venda_nums?: string[] | null
        }
        Update: {
          action?: string
          card_id?: string | null
          card_title?: string | null
          cpf?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          error_message?: string | null
          id?: string
          import_log_id?: string
          pagante?: string | null
          previous_state?: Json | null
          products_count?: number
          reverted_at?: string | null
          reverted_by?: string | null
          stage_name?: string | null
          total_receita?: number
          total_venda?: number
          venda_nums?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_venda_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "pos_venda_import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "pos_venda_import_log_items_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_venda_import_logs: {
        Row: {
          cards_created: number
          cards_updated: number
          contacts_created: number
          created_at: string
          created_by: string | null
          duplicates_skipped: number
          error_message: string | null
          file_name: string
          id: string
          products_imported: number
          reverted_count: number
          status: string
          total_rows: number
          trips_found: number
        }
        Insert: {
          cards_created?: number
          cards_updated?: number
          contacts_created?: number
          created_at?: string
          created_by?: string | null
          duplicates_skipped?: number
          error_message?: string | null
          file_name: string
          id?: string
          products_imported?: number
          reverted_count?: number
          status?: string
          total_rows?: number
          trips_found?: number
        }
        Update: {
          cards_created?: number
          cards_updated?: number
          contacts_created?: number
          created_at?: string
          created_by?: string | null
          duplicates_skipped?: number
          error_message?: string | null
          file_name?: string
          id?: string
          products_imported?: number
          reverted_count?: number
          status?: string
          total_rows?: number
          trips_found?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_venda_import_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_venda_import_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "pos_venda_import_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      product_requirements: {
        Row: {
          arquivo_id: string | null
          card_id: string
          concluido_em: string | null
          concluido_por: string | null
          created_at: string | null
          data_value: string | null
          financial_item_id: string
          id: string
          notas: string | null
          ordem: number | null
          org_id: string
          status: string | null
          titulo: string
        }
        Insert: {
          arquivo_id?: string | null
          card_id: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string | null
          data_value?: string | null
          financial_item_id: string
          id?: string
          notas?: string | null
          ordem?: number | null
          org_id?: string
          status?: string | null
          titulo: string
        }
        Update: {
          arquivo_id?: string | null
          card_id?: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string | null
          data_value?: string | null
          financial_item_id?: string
          id?: string
          notas?: string | null
          ordem?: number | null
          org_id?: string
          status?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "product_requirements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "product_requirements_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_financial_item_id_fkey"
            columns: ["financial_item_id"]
            isOneToOne: false
            referencedRelation: "card_financial_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requirements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          color_class: string
          created_at: string
          deal_label: string | null
          deal_plural: string | null
          display_order: number
          icon_name: string
          id: string
          main_date_label: string | null
          name: string
          name_short: string
          not_found_label: string | null
          org_id: string
          pipeline_id: string | null
          slug: Database["public"]["Enums"]["app_product"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          color_class: string
          created_at?: string
          deal_label?: string | null
          deal_plural?: string | null
          display_order?: number
          icon_name: string
          id?: string
          main_date_label?: string | null
          name: string
          name_short: string
          not_found_label?: string | null
          org_id: string
          pipeline_id?: string | null
          slug: Database["public"]["Enums"]["app_product"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          color_class?: string
          created_at?: string
          deal_label?: string | null
          deal_plural?: string | null
          display_order?: number
          icon_name?: string
          id?: string
          main_date_label?: string | null
          name?: string
          name_short?: string
          not_found_label?: string | null
          org_id?: string
          pipeline_id?: string | null
          slug?: Database["public"]["Enums"]["app_product"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          created_at: string | null
          department_id: string | null
          email: string | null
          id: string
          is_admin: boolean | null
          nome: string | null
          org_id: string
          phone: string | null
          produtos: Database["public"]["Enums"]["app_product"][] | null
          role: Database["public"]["Enums"]["app_role"] | null
          role_id: string | null
          team_id: string | null
          teams_notify_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          id: string
          is_admin?: boolean | null
          nome?: string | null
          org_id?: string
          phone?: string | null
          produtos?: Database["public"]["Enums"]["app_product"][] | null
          role?: Database["public"]["Enums"]["app_role"] | null
          role_id?: string | null
          team_id?: string | null
          teams_notify_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean | null
          nome?: string | null
          org_id?: string
          phone?: string | null
          produtos?: Database["public"]["Enums"]["app_product"][] | null
          role?: Database["public"]["Enums"]["app_role"] | null
          role_id?: string | null
          team_id?: string | null
          teams_notify_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["team_id"]
          },
        ]
      }
      proposal_client_selections: {
        Row: {
          flight_id: string | null
          id: string
          item_id: string
          option_id: string | null
          proposal_id: string
          selected: boolean
          selected_at: string | null
          selection_metadata: Json | null
          selection_type: string | null
          updated_at: string | null
        }
        Insert: {
          flight_id?: string | null
          id?: string
          item_id: string
          option_id?: string | null
          proposal_id: string
          selected?: boolean
          selected_at?: string | null
          selection_metadata?: Json | null
          selection_type?: string | null
          updated_at?: string | null
        }
        Update: {
          flight_id?: string | null
          id?: string
          item_id?: string
          option_id?: string | null
          proposal_id?: string
          selected?: boolean
          selected_at?: string | null
          selection_metadata?: Json | null
          selection_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_client_selections_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "proposal_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_client_selections_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_client_selections_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_client_selections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_client_selections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_client_selections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_comments: {
        Row: {
          author_id: string | null
          author_name: string
          author_type: string
          content: string
          created_at: string | null
          id: string
          is_resolved: boolean | null
          parent_id: string | null
          proposal_id: string
          resolved_at: string | null
          resolved_by: string | null
          section_id: string | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          author_type: string
          content: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          parent_id?: string | null
          proposal_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          author_type?: string
          content?: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          parent_id?: string | null
          proposal_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "proposal_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_comments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "proposal_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_comments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "proposal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_events: {
        Row: {
          client_ip: string | null
          created_at: string | null
          device_type: string | null
          duration_seconds: number | null
          event_type: string
          flight_id: string | null
          id: string
          item_id: string | null
          org_id: string
          payload: Json | null
          proposal_id: string
          referrer: string | null
          scroll_depth: number | null
          section_id: string | null
          user_agent: string | null
          viewport_width: number | null
        }
        Insert: {
          client_ip?: string | null
          created_at?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          event_type: string
          flight_id?: string | null
          id?: string
          item_id?: string | null
          org_id?: string
          payload?: Json | null
          proposal_id: string
          referrer?: string | null
          scroll_depth?: number | null
          section_id?: string | null
          user_agent?: string | null
          viewport_width?: number | null
        }
        Update: {
          client_ip?: string | null
          created_at?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          event_type?: string
          flight_id?: string | null
          id?: string
          item_id?: string | null
          org_id?: string
          payload?: Json | null
          proposal_id?: string
          referrer?: string | null
          scroll_depth?: number | null
          section_id?: string | null
          user_agent?: string | null
          viewport_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "proposal_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "proposal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_flights: {
        Row: {
          airline_code: string | null
          airline_logo_url: string | null
          airline_name: string | null
          arrival_datetime: string | null
          baggage_included: string | null
          cabin_class: string | null
          created_at: string | null
          currency: string | null
          departure_datetime: string | null
          destination_airport: string
          destination_city: string | null
          duration_minutes: number | null
          extracted_from_image: boolean | null
          extraction_confidence: number | null
          flight_number: string | null
          id: string
          is_recommended: boolean | null
          is_selected: boolean | null
          layover_details: Json | null
          option_group: string | null
          ordem: number | null
          origin_airport: string
          origin_city: string | null
          price_per_person: number | null
          price_total: number | null
          proposal_id: string
          raw_extracted_text: string | null
          section_id: string | null
          segment_order: number | null
          stops: number | null
          supplier_cost: number | null
          trip_leg: string
          updated_at: string | null
        }
        Insert: {
          airline_code?: string | null
          airline_logo_url?: string | null
          airline_name?: string | null
          arrival_datetime?: string | null
          baggage_included?: string | null
          cabin_class?: string | null
          created_at?: string | null
          currency?: string | null
          departure_datetime?: string | null
          destination_airport: string
          destination_city?: string | null
          duration_minutes?: number | null
          extracted_from_image?: boolean | null
          extraction_confidence?: number | null
          flight_number?: string | null
          id?: string
          is_recommended?: boolean | null
          is_selected?: boolean | null
          layover_details?: Json | null
          option_group?: string | null
          ordem?: number | null
          origin_airport: string
          origin_city?: string | null
          price_per_person?: number | null
          price_total?: number | null
          proposal_id: string
          raw_extracted_text?: string | null
          section_id?: string | null
          segment_order?: number | null
          stops?: number | null
          supplier_cost?: number | null
          trip_leg: string
          updated_at?: string | null
        }
        Update: {
          airline_code?: string | null
          airline_logo_url?: string | null
          airline_name?: string | null
          arrival_datetime?: string | null
          baggage_included?: string | null
          cabin_class?: string | null
          created_at?: string | null
          currency?: string | null
          departure_datetime?: string | null
          destination_airport?: string
          destination_city?: string | null
          duration_minutes?: number | null
          extracted_from_image?: boolean | null
          extraction_confidence?: number | null
          flight_number?: string | null
          id?: string
          is_recommended?: boolean | null
          is_selected?: boolean | null
          layover_details?: Json | null
          option_group?: string | null
          ordem?: number | null
          origin_airport?: string
          origin_city?: string | null
          price_per_person?: number | null
          price_total?: number | null
          proposal_id?: string
          raw_extracted_text?: string | null
          section_id?: string | null
          segment_order?: number | null
          stops?: number | null
          supplier_cost?: number | null
          trip_leg?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_flights_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_flights_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_flights_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_flights_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "proposal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          base_price: number
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_default_selected: boolean
          is_optional: boolean
          item_type: Database["public"]["Enums"]["proposal_item_type"]
          ordem: number
          org_id: string
          rich_content: Json | null
          section_id: string
          supplier: string | null
          supplier_cost: number | null
          title: string
        }
        Insert: {
          base_price?: number
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_default_selected?: boolean
          is_optional?: boolean
          item_type: Database["public"]["Enums"]["proposal_item_type"]
          ordem?: number
          org_id?: string
          rich_content?: Json | null
          section_id: string
          supplier?: string | null
          supplier_cost?: number | null
          title: string
        }
        Update: {
          base_price?: number
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_default_selected?: boolean
          is_optional?: boolean
          item_type?: Database["public"]["Enums"]["proposal_item_type"]
          ordem?: number
          org_id?: string
          rich_content?: Json | null
          section_id?: string
          supplier?: string | null
          supplier_cost?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "proposal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_library: {
        Row: {
          amenities: string[] | null
          base_price: number | null
          cancellation_policy: string | null
          category: string
          check_in_time: string | null
          check_out_time: string | null
          content: Json
          created_at: string | null
          created_by: string | null
          currency: string | null
          destination: string | null
          gallery_urls: string[] | null
          id: string
          is_shared: boolean
          last_used_at: string | null
          location_city: string | null
          location_country: string | null
          name: string
          name_search: string | null
          ownership_type: string | null
          saved_from_proposal_id: string | null
          star_rating: number | null
          supplier: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number
        }
        Insert: {
          amenities?: string[] | null
          base_price?: number | null
          cancellation_policy?: string | null
          category: string
          check_in_time?: string | null
          check_out_time?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          destination?: string | null
          gallery_urls?: string[] | null
          id?: string
          is_shared?: boolean
          last_used_at?: string | null
          location_city?: string | null
          location_country?: string | null
          name: string
          name_search?: string | null
          ownership_type?: string | null
          saved_from_proposal_id?: string | null
          star_rating?: number | null
          supplier?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number
        }
        Update: {
          amenities?: string[] | null
          base_price?: number | null
          cancellation_policy?: string | null
          category?: string
          check_in_time?: string | null
          check_out_time?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          destination?: string | null
          gallery_urls?: string[] | null
          id?: string
          is_shared?: boolean
          last_used_at?: string | null
          location_city?: string | null
          location_country?: string | null
          name?: string
          name_search?: string | null
          ownership_type?: string | null
          saved_from_proposal_id?: string | null
          star_rating?: number | null
          supplier?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "proposal_library_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_library_saved_from_proposal_id_fkey"
            columns: ["saved_from_proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_library_saved_from_proposal_id_fkey"
            columns: ["saved_from_proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_library_saved_from_proposal_id_fkey"
            columns: ["saved_from_proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_options: {
        Row: {
          created_at: string | null
          description: string | null
          details: Json | null
          id: string
          item_id: string
          option_label: string
          ordem: number
          price_delta: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          details?: Json | null
          id?: string
          item_id: string
          option_label: string
          ordem?: number
          price_delta?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          details?: Json | null
          id?: string
          item_id?: string
          option_label?: string
          ordem?: number
          price_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_options_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_sections: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          ordem: number
          org_id: string
          section_type: Database["public"]["Enums"]["proposal_section_type"]
          title: string
          version_id: string
          visible: boolean
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          ordem?: number
          org_id?: string
          section_type: Database["public"]["Enums"]["proposal_section_type"]
          title: string
          version_id: string
          visible?: boolean
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          ordem?: number
          org_id?: string
          section_type?: Database["public"]["Enums"]["proposal_section_type"]
          title?: string
          version_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_sections_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "proposal_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_global: boolean | null
          last_used_at: string | null
          metadata: Json | null
          name: string
          sections: Json
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_global?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          name: string
          sections?: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_global?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          name?: string
          sections?: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      proposal_versions: {
        Row: {
          change_summary: string | null
          created_at: string | null
          created_by: string | null
          id: string
          metadata: Json | null
          org_id: string
          proposal_id: string
          title: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          proposal_id: string
          title: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          proposal_id?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "proposal_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          accepted_total: number | null
          accepted_version_id: string | null
          active_version_id: string | null
          card_data_imported: boolean | null
          card_id: string | null
          card_linked_at: string | null
          content: Json | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          org_id: string
          public_token: string | null
          status: string
          updated_at: string | null
          valid_until: string | null
          version: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_total?: number | null
          accepted_version_id?: string | null
          active_version_id?: string | null
          card_data_imported?: boolean | null
          card_id?: string | null
          card_linked_at?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          public_token?: string | null
          status?: string
          updated_at?: string | null
          valid_until?: string | null
          version?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_total?: number | null
          accepted_version_id?: string | null
          active_version_id?: string | null
          card_data_imported?: boolean | null
          card_id?: string | null
          card_linked_at?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          public_token?: string | null
          status?: string
          updated_at?: string | null
          valid_until?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_proposals_accepted_version"
            columns: ["accepted_version_id"]
            isOneToOne: false
            referencedRelation: "proposal_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_proposals_active_version"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "proposal_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_preferences: {
        Row: {
          enabled: boolean | null
          lead_assigned: boolean | null
          meeting_reminder: boolean | null
          org_id: string
          proposal_status: boolean | null
          task_expiring: boolean | null
          task_overdue: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          enabled?: boolean | null
          lead_assigned?: boolean | null
          meeting_reminder?: boolean | null
          org_id?: string
          proposal_status?: boolean | null
          task_expiring?: boolean | null
          task_overdue?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          enabled?: boolean | null
          lead_assigned?: boolean | null
          meeting_reminder?: boolean | null
          org_id?: string
          proposal_status?: boolean | null
          task_expiring?: boolean | null
          task_overdue?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "push_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          org_id: string
          p256dh: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          org_id?: string
          p256dh: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          org_id?: string
          p256dh?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      reunioes: {
        Row: {
          card_id: string
          created_at: string | null
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          feedback: string | null
          id: string
          local: string | null
          motivo_cancelamento: string | null
          notas: string | null
          notificada_push: boolean | null
          org_id: string
          participantes: Json | null
          responsavel_id: string | null
          resultado: string | null
          sdr_responsavel_id: string | null
          status: string | null
          titulo: string
          transcricao: string | null
          transcricao_metadata: Json | null
        }
        Insert: {
          card_id: string
          created_at?: string | null
          created_by?: string | null
          data_fim?: string | null
          data_inicio: string
          feedback?: string | null
          id?: string
          local?: string | null
          motivo_cancelamento?: string | null
          notas?: string | null
          notificada_push?: boolean | null
          org_id?: string
          participantes?: Json | null
          responsavel_id?: string | null
          resultado?: string | null
          sdr_responsavel_id?: string | null
          status?: string | null
          titulo: string
          transcricao?: string | null
          transcricao_metadata?: Json | null
        }
        Update: {
          card_id?: string
          created_at?: string | null
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          feedback?: string | null
          id?: string
          local?: string | null
          motivo_cancelamento?: string | null
          notas?: string | null
          notificada_push?: boolean | null
          org_id?: string
          participantes?: Json | null
          responsavel_id?: string | null
          resultado?: string | null
          sdr_responsavel_id?: string | null
          status?: string | null
          titulo?: string
          transcricao?: string | null
          transcricao_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "reunioes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "reunioes_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_sdr_responsavel_id_fkey"
            columns: ["sdr_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reunioes_sdr_responsavel_id_fkey"
            columns: ["sdr_responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "reunioes_sdr_responsavel_id_fkey"
            columns: ["sdr_responsavel_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_system: boolean | null
          name: string
          org_id: string
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_system?: boolean | null
          name: string
          org_id?: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_system?: boolean | null
          name?: string
          org_id?: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      section_field_config: {
        Row: {
          created_at: string | null
          field_key: string
          id: string
          is_required: boolean
          is_visible: boolean
          org_id: string
          section_key: string
        }
        Insert: {
          created_at?: string | null
          field_key: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          org_id?: string
          section_key: string
        }
        Update: {
          created_at?: string | null
          field_key?: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          org_id?: string
          section_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_field_config_field_key_fkey"
            columns: ["field_key"]
            isOneToOne: false
            referencedRelation: "system_fields"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "section_field_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_field_config_section_key_fkey"
            columns: ["section_key"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["key"]
          },
        ]
      }
      sections: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          default_collapsed: boolean
          icon: string | null
          id: string
          is_governable: boolean | null
          is_system: boolean | null
          key: string
          label: string
          order_index: number | null
          org_id: string
          pipeline_id: string | null
          position: string | null
          produto: Database["public"]["Enums"]["app_product"] | null
          updated_at: string | null
          widget_component: string | null
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          default_collapsed?: boolean
          icon?: string | null
          id?: string
          is_governable?: boolean | null
          is_system?: boolean | null
          key: string
          label: string
          order_index?: number | null
          org_id?: string
          pipeline_id?: string | null
          position?: string | null
          produto?: Database["public"]["Enums"]["app_product"] | null
          updated_at?: string | null
          widget_component?: string | null
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          default_collapsed?: boolean
          icon?: string | null
          id?: string
          is_governable?: boolean | null
          is_system?: boolean | null
          key?: string
          label?: string
          order_index?: number | null
          org_id?: string
          pipeline_id?: string | null
          position?: string | null
          produto?: Database["public"]["Enums"]["app_product"] | null
          updated_at?: string | null
          widget_component?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_field_config: {
        Row: {
          bypass_sources: string[] | null
          created_at: string | null
          custom_label: string | null
          description: string | null
          field_key: string | null
          id: string
          is_blocking: boolean | null
          is_required: boolean | null
          is_secondary: boolean
          is_visible: boolean | null
          order: number | null
          org_id: string
          proposal_min_status: string | null
          requirement_label: string | null
          requirement_type: string | null
          show_in_header: boolean | null
          stage_id: string | null
          task_require_completed: boolean | null
          task_tipo: string | null
          updated_at: string | null
        }
        Insert: {
          bypass_sources?: string[] | null
          created_at?: string | null
          custom_label?: string | null
          description?: string | null
          field_key?: string | null
          id?: string
          is_blocking?: boolean | null
          is_required?: boolean | null
          is_secondary?: boolean
          is_visible?: boolean | null
          order?: number | null
          org_id?: string
          proposal_min_status?: string | null
          requirement_label?: string | null
          requirement_type?: string | null
          show_in_header?: boolean | null
          stage_id?: string | null
          task_require_completed?: boolean | null
          task_tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          bypass_sources?: string[] | null
          created_at?: string | null
          custom_label?: string | null
          description?: string | null
          field_key?: string | null
          id?: string
          is_blocking?: boolean | null
          is_required?: boolean | null
          is_secondary?: boolean
          is_visible?: boolean | null
          order?: number | null
          org_id?: string
          proposal_min_status?: string | null
          requirement_label?: string | null
          requirement_type?: string | null
          show_in_header?: boolean | null
          stage_id?: string | null
          task_require_completed?: boolean | null
          task_tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_field_config_field_key_fkey"
            columns: ["field_key"]
            isOneToOne: false
            referencedRelation: "system_fields"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "stage_field_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_field_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_field_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      stage_fields_settings: {
        Row: {
          created_at: string | null
          field_key: string
          id: string
          label: string
          required: boolean | null
          stage_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          field_key: string
          id?: string
          label: string
          required?: boolean | null
          stage_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          field_key?: string
          id?: string
          label?: string
          required?: boolean | null
          stage_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_fields_settings_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_fields_settings_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "stage_fields_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_fields_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "stage_fields_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_section_config: {
        Row: {
          created_at: string | null
          default_collapsed: boolean
          id: string
          is_visible: boolean
          org_id: string
          section_key: string
          stage_id: string
        }
        Insert: {
          created_at?: string | null
          default_collapsed?: boolean
          id?: string
          is_visible?: boolean
          org_id?: string
          section_key: string
          stage_id: string
        }
        Update: {
          created_at?: string | null
          default_collapsed?: boolean
          id?: string
          is_visible?: boolean
          org_id?: string
          section_key?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_section_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_section_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_section_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      stage_transitions: {
        Row: {
          allowed: boolean | null
          created_at: string | null
          id: string
          org_id: string
          source_stage_id: string | null
          target_stage_id: string | null
          updated_at: string | null
        }
        Insert: {
          allowed?: boolean | null
          created_at?: string | null
          id?: string
          org_id?: string
          source_stage_id?: string | null
          target_stage_id?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed?: boolean | null
          created_at?: string | null
          id?: string
          org_id?: string
          source_stage_id?: string | null
          target_stage_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_source_stage_id_fkey"
            columns: ["source_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_source_stage_id_fkey"
            columns: ["source_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "stage_transitions_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      sub_card_sync_log: {
        Row: {
          action: string
          created_at: string | null
          created_by: string | null
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          parent_card_id: string
          sub_card_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          parent_card_id: string
          sub_card_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          parent_card_id?: string
          sub_card_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_card_sync_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_sub_card_id_fkey"
            columns: ["sub_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_sub_card_id_fkey"
            columns: ["sub_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_sub_card_id_fkey"
            columns: ["sub_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_sub_card_id_fkey"
            columns: ["sub_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "sub_card_sync_log_sub_card_id_fkey"
            columns: ["sub_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      system_fields: {
        Row: {
          active: boolean | null
          created_at: string | null
          is_system: boolean | null
          key: string
          label: string
          options: Json | null
          order_index: number | null
          org_id: string
          section: string | null
          section_id: string | null
          type: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          is_system?: boolean | null
          key: string
          label: string
          options?: Json | null
          order_index?: number | null
          org_id?: string
          section?: string | null
          section_id?: string | null
          type: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          is_system?: boolean | null
          key?: string
          label?: string
          options?: Json | null
          order_index?: number | null
          org_id?: string
          section?: string | null
          section_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          card_id: string
          categoria_outro: string | null
          concluida: boolean
          concluida_em: string | null
          concluido_por: string | null
          created_at: string | null
          created_by: string | null
          data_conclusao: string | null
          data_vencimento: string | null
          deleted_at: string | null
          descricao: string | null
          external_id: string | null
          external_source: string | null
          feedback: string | null
          id: string
          metadata: Json | null
          motivo_cancelamento: string | null
          notificada_push: boolean | null
          org_id: string
          outcome: string | null
          participantes_externos: string[] | null
          prioridade: string | null
          rescheduled_from_id: string | null
          rescheduled_to_id: string | null
          responsavel_id: string | null
          resultado: string | null
          started_at: string | null
          status: string | null
          tipo: string | null
          titulo: string
          transcricao: string | null
          transcricao_metadata: Json | null
        }
        Insert: {
          card_id: string
          categoria_outro?: string | null
          concluida?: boolean
          concluida_em?: string | null
          concluido_por?: string | null
          created_at?: string | null
          created_by?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          external_id?: string | null
          external_source?: string | null
          feedback?: string | null
          id?: string
          metadata?: Json | null
          motivo_cancelamento?: string | null
          notificada_push?: boolean | null
          org_id?: string
          outcome?: string | null
          participantes_externos?: string[] | null
          prioridade?: string | null
          rescheduled_from_id?: string | null
          rescheduled_to_id?: string | null
          responsavel_id?: string | null
          resultado?: string | null
          started_at?: string | null
          status?: string | null
          tipo?: string | null
          titulo: string
          transcricao?: string | null
          transcricao_metadata?: Json | null
        }
        Update: {
          card_id?: string
          categoria_outro?: string | null
          concluida?: boolean
          concluida_em?: string | null
          concluido_por?: string | null
          created_at?: string | null
          created_by?: string | null
          data_conclusao?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          external_id?: string | null
          external_source?: string | null
          feedback?: string | null
          id?: string
          metadata?: Json | null
          motivo_cancelamento?: string | null
          notificada_push?: boolean | null
          org_id?: string
          outcome?: string | null
          participantes_externos?: string[] | null
          prioridade?: string | null
          rescheduled_from_id?: string | null
          rescheduled_to_id?: string | null
          responsavel_id?: string | null
          resultado?: string | null
          started_at?: string | null
          status?: string | null
          tipo?: string | null
          titulo?: string
          transcricao?: string | null
          transcricao_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "view_agenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_rescheduled_to_id_fkey"
            columns: ["rescheduled_to_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_rescheduled_to_id_fkey"
            columns: ["rescheduled_to_id"]
            isOneToOne: false
            referencedRelation: "view_agenda"
            referencedColumns: ["id"]
          },
        ]
      }
      task_queue: {
        Row: {
          card_id: string
          created_at: string | null
          error_message: string | null
          id: string
          processed: boolean | null
          rule_id: string | null
          scheduled_for: string
        }
        Insert: {
          card_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed?: boolean | null
          rule_id?: string | null
          scheduled_for: string
        }
        Update: {
          card_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed?: boolean | null
          rule_id?: string | null
          scheduled_for?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "task_queue_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_queue_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      task_type_outcomes: {
        Row: {
          is_success: boolean | null
          ordem: number | null
          outcome_key: string
          outcome_label: string
          tipo: string
        }
        Insert: {
          is_success?: boolean | null
          ordem?: number | null
          outcome_key: string
          outcome_label: string
          tipo: string
        }
        Update: {
          is_success?: boolean | null
          ordem?: number | null
          outcome_key?: string
          outcome_label?: string
          tipo?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean | null
          leader_id: string | null
          name: string
          org_id: string
          phase_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name: string
          org_id?: string
          phase_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
          org_id?: string
          phase_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      text_blocks: {
        Row: {
          category: string
          content: string
          content_html: string | null
          created_at: string | null
          created_by: string | null
          destination_tags: string[] | null
          id: string
          is_default: boolean | null
          last_used_at: string | null
          name: string
          org_id: string
          ownership_type: string | null
          trip_types: string[] | null
          updated_at: string | null
          usage_count: number | null
          variables: string[] | null
        }
        Insert: {
          category: string
          content: string
          content_html?: string | null
          created_at?: string | null
          created_by?: string | null
          destination_tags?: string[] | null
          id?: string
          is_default?: boolean | null
          last_used_at?: string | null
          name: string
          org_id?: string
          ownership_type?: string | null
          trip_types?: string[] | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: string[] | null
        }
        Update: {
          category?: string
          content?: string
          content_html?: string | null
          created_at?: string | null
          created_by?: string | null
          destination_tags?: string[] | null
          id?: string
          is_default?: boolean | null
          last_used_at?: string | null
          name?: string
          org_id?: string
          ownership_type?: string | null
          trip_types?: string[] | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "text_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "text_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          id: string
          payload: Json | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          contact_id: string | null
          created_at: string | null
          external_conversation_id: string | null
          external_conversation_url: string | null
          id: string
          instance_id: string | null
          last_message_at: string | null
          org_id: string
          phone_number_label: string | null
          platform_id: string | null
          status: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          external_conversation_id?: string | null
          external_conversation_url?: string | null
          id?: string
          instance_id?: string | null
          last_message_at?: string | null
          org_id?: string
          phone_number_label?: string | null
          platform_id?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          external_conversation_id?: string | null
          external_conversation_url?: string | null
          id?: string
          instance_id?: string | null
          last_message_at?: string | null
          org_id?: string
          phone_number_label?: string | null
          platform_id?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_custom_fields: {
        Row: {
          created_at: string | null
          created_by: string | null
          field_group: string | null
          field_key: string
          field_label: string
          id: string
          is_active: boolean | null
          platform_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          field_group?: string | null
          field_key: string
          field_label: string
          id?: string
          is_active?: boolean | null
          platform_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          field_group?: string | null
          field_key?: string
          field_label?: string
          id?: string
          is_active?: boolean | null
          platform_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_custom_fields_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_field_mappings: {
        Row: {
          created_at: string | null
          description: string | null
          external_path: string
          id: string
          internal_field: string
          is_active: boolean | null
          platform_id: string | null
          transform_config: Json | null
          transform_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_path: string
          id?: string
          internal_field: string
          is_active?: boolean | null
          platform_id?: string | null
          transform_config?: Json | null
          transform_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_path?: string
          id?: string
          internal_field?: string
          is_active?: boolean | null
          platform_id?: string | null
          transform_config?: Json | null
          transform_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_field_mappings_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          card_id: string | null
          contact_id: string | null
          created_at: string | null
          group_jid: string
          group_name: string | null
          id: string
          org_id: string
          platform_id: string | null
          updated_at: string | null
        }
        Insert: {
          card_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          group_jid: string
          group_name?: string | null
          id?: string
          org_id?: string
          platform_id?: string | null
          updated_at?: string | null
        }
        Update: {
          card_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          group_jid?: string
          group_name?: string | null
          id?: string
          org_id?: string
          platform_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_linha_config: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          criar_card: boolean | null
          criar_contato: boolean | null
          default_owner_id: string | null
          fase_label: string | null
          id: string
          phase_id: string | null
          phone_number_id: string | null
          phone_number_label: string
          pipeline_id: string | null
          platform_id: string | null
          produto: string | null
          stage_id: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          criar_card?: boolean | null
          criar_contato?: boolean | null
          default_owner_id?: string | null
          fase_label?: string | null
          id?: string
          phase_id?: string | null
          phone_number_id?: string | null
          phone_number_label: string
          pipeline_id?: string | null
          platform_id?: string | null
          produto?: string | null
          stage_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          criar_card?: boolean | null
          criar_contato?: boolean | null
          default_owner_id?: string | null
          fase_label?: string | null
          id?: string
          phase_id?: string | null
          phone_number_id?: string | null
          phone_number_label?: string
          pipeline_id?: string | null
          platform_id?: string | null
          produto?: string | null
          stage_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_linha_config_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_linha_config_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          ack_status: number | null
          actor_type: string | null
          agent_email: string | null
          assigned_to: string | null
          body: string | null
          card_id: string | null
          contact_id: string | null
          contact_tags: Json | null
          conversation_id: string | null
          conversation_status: string | null
          created_at: string | null
          direction: string | null
          ecko_agent_id: string | null
          error_message: string | null
          external_id: string | null
          fase_label: string | null
          group_jid: string | null
          group_name: string | null
          has_error: boolean | null
          id: string
          is_from_me: boolean | null
          is_group: boolean | null
          is_read: boolean | null
          lead_id: string | null
          media_content: string | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          org_id: string
          organization: string | null
          organization_id: string | null
          origem: string | null
          phone_number_id: string | null
          phone_number_label: string | null
          platform_id: string | null
          produto: string | null
          raw_event_id: string | null
          sector: string | null
          sender_name: string | null
          sender_phone: string | null
          sent_by_user_id: string | null
          sent_by_user_name: string | null
          sent_by_user_role: string | null
          session_id: string | null
          status: string | null
          type: string | null
          updated_at: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          ack_status?: number | null
          actor_type?: string | null
          agent_email?: string | null
          assigned_to?: string | null
          body?: string | null
          card_id?: string | null
          contact_id?: string | null
          contact_tags?: Json | null
          conversation_id?: string | null
          conversation_status?: string | null
          created_at?: string | null
          direction?: string | null
          ecko_agent_id?: string | null
          error_message?: string | null
          external_id?: string | null
          fase_label?: string | null
          group_jid?: string | null
          group_name?: string | null
          has_error?: boolean | null
          id?: string
          is_from_me?: boolean | null
          is_group?: boolean | null
          is_read?: boolean | null
          lead_id?: string | null
          media_content?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          org_id?: string
          organization?: string | null
          organization_id?: string | null
          origem?: string | null
          phone_number_id?: string | null
          phone_number_label?: string | null
          platform_id?: string | null
          produto?: string | null
          raw_event_id?: string | null
          sector?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_by_user_id?: string | null
          sent_by_user_name?: string | null
          sent_by_user_role?: string | null
          session_id?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          ack_status?: number | null
          actor_type?: string | null
          agent_email?: string | null
          assigned_to?: string | null
          body?: string | null
          card_id?: string | null
          contact_id?: string | null
          contact_tags?: Json | null
          conversation_id?: string | null
          conversation_status?: string | null
          created_at?: string | null
          direction?: string | null
          ecko_agent_id?: string | null
          error_message?: string | null
          external_id?: string | null
          fase_label?: string | null
          group_jid?: string | null
          group_name?: string | null
          has_error?: boolean | null
          id?: string
          is_from_me?: boolean | null
          is_group?: boolean | null
          is_read?: boolean | null
          lead_id?: string | null
          media_content?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          org_id?: string
          organization?: string | null
          organization_id?: string | null
          origem?: string | null
          phone_number_id?: string | null
          phone_number_label?: string | null
          platform_id?: string | null
          produto?: string | null
          raw_event_id?: string | null
          sector?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_by_user_id?: string | null
          sent_by_user_name?: string | null
          sent_by_user_role?: string | null
          session_id?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_raw_event_id_fkey"
            columns: ["raw_event_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_raw_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_user_id_fkey"
            columns: ["sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_user_id_fkey"
            columns: ["sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_user_id_fkey"
            columns: ["sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_phase_instance_map: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          phase_id: string | null
          platform_id: string | null
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          phase_id?: string | null
          platform_id?: string | null
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          phase_id?: string | null
          platform_id?: string | null
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_phase_instance_map_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_phase_instance_map_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_platforms: {
        Row: {
          api_base_url: string | null
          api_key_encrypted: string | null
          capabilities: Json | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          dashboard_url_template: string | null
          id: string
          instance_id: string | null
          instance_label: string | null
          is_active: boolean | null
          last_event_at: string | null
          name: string
          provider: string
          updated_at: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_key_encrypted?: string | null
          capabilities?: Json | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          dashboard_url_template?: string | null
          id?: string
          instance_id?: string | null
          instance_label?: string | null
          is_active?: boolean | null
          last_event_at?: string | null
          name: string
          provider: string
          updated_at?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_key_encrypted?: string | null
          capabilities?: Json | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          dashboard_url_template?: string | null
          id?: string
          instance_id?: string | null
          instance_label?: string | null
          is_active?: boolean | null
          last_event_at?: string | null
          name?: string
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_raw_events: {
        Row: {
          card_id: string | null
          contact_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          idempotency_key: string | null
          org_id: string
          origem: string | null
          platform_id: string | null
          processed_at: string | null
          raw_payload: Json
          status: string | null
        }
        Insert: {
          card_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          idempotency_key?: string | null
          org_id?: string
          origem?: string | null
          platform_id?: string | null
          processed_at?: string | null
          raw_payload: Json
          status?: string | null
        }
        Update: {
          card_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          idempotency_key?: string | null
          org_id?: string
          origem?: string | null
          platform_id?: string | null
          processed_at?: string | null
          raw_payload?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_raw_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_raw_events_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      integration_conflicts_summary: {
        Row: {
          actual_stage_id: string | null
          actual_stage_name: string | null
          card_id: string | null
          card_titulo: string | null
          conflict_type: string | null
          created_at: string | null
          id: string | null
          integration_id: string | null
          integration_name: string | null
          missing_count: number | null
          missing_requirements: Json | null
          notes: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          target_stage_id: string | null
          target_stage_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_conflict_log_actual_stage_id_fkey"
            columns: ["actual_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_actual_stage_id_fkey"
            columns: ["actual_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "integration_conflict_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflict_log_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      v_contact_proposals: {
        Row: {
          accepted_at: string | null
          card_id: string | null
          card_title: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          data_viagem_fim: string | null
          data_viagem_inicio: string | null
          proposal_id: string | null
          proposal_title: string | null
          role: string | null
          status: string | null
          total_value: number | null
          valid_until: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "proposals_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      v_monde_sent_items: {
        Row: {
          card_id: string | null
          monde_sale_id: string | null
          monde_sale_number: string | null
          proposal_flight_id: string | null
          proposal_item_id: string | null
          sale_date: string | null
          sale_id: string | null
          status: string | null
          supplier: string | null
          title: string | null
          total_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monde_sale_items_proposal_flight_id_fkey"
            columns: ["proposal_flight_id"]
            isOneToOne: false
            referencedRelation: "proposal_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sale_items_proposal_item_id_fkey"
            columns: ["proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "monde_sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      v_proposal_analytics: {
        Row: {
          alert_status: string | null
          card_title: string | null
          consultant_name: string | null
          created_at: string | null
          created_by: string | null
          data_viagem_fim: string | null
          data_viagem_inicio: string | null
          hours_since_created: number | null
          hours_to_accept: number | null
          id: string | null
          max_scroll_depth: number | null
          proposal_title: string | null
          status: string | null
          total_time_seconds: number | null
          unique_view_days: number | null
          view_count: number | null
        }
        Relationships: []
      }
      v_team_proposal_performance: {
        Row: {
          accepted_proposals: number | null
          avg_hours_to_accept: number | null
          consultant_id: string | null
          consultant_name: string | null
          conversion_rate: number | null
          sent_proposals: number | null
          total_proposals: number | null
        }
        Relationships: []
      }
      view_agenda: {
        Row: {
          card_id: string | null
          created_at: string | null
          data: string | null
          entity_type: string | null
          id: string | null
          responsavel_id: string | null
          status: string | null
          titulo: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          data?: string | null
          entity_type?: string | null
          id?: string | null
          responsavel_id?: string | null
          status?: string | null
          titulo?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          data?: string | null
          entity_type?: string | null
          id?: string | null
          responsavel_id?: string | null
          status?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "tarefas_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      view_archived_cards: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          archived_by_nome: string | null
          created_at: string | null
          data_viagem_inicio: string | null
          dono_atual_nome: string | null
          etapa_nome: string | null
          fase: string | null
          id: string | null
          org_id: string | null
          origem: string | null
          pessoa_nome: string | null
          pessoa_sobrenome: string | null
          produto: Database["public"]["Enums"]["app_product"] | null
          receita: number | null
          status_comercial: string | null
          titulo: string | null
          valor_display: number | null
          valor_estimado: number | null
          valor_final: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      view_cards_acoes: {
        Row: {
          active_sub_cards_count: number | null
          anexos_count: number | null
          archived_at: string | null
          briefing_inicial: Json | null
          campaign_id: string | null
          card_type: string | null
          cliente_recorrente: boolean | null
          concierge_nome: string | null
          concierge_owner_id: string | null
          condicoes_pagamento: string | null
          created_at: string | null
          data_fechamento: string | null
          data_viagem_inicio: string | null
          destinos: Json | null
          dias_ate_viagem: number | null
          dono_atual_email: string | null
          dono_atual_id: string | null
          dono_atual_nome: string | null
          estado_operacional: string | null
          etapa_nome: string | null
          etapa_ordem: number | null
          external_id: string | null
          fase: string | null
          forma_pagamento: string | null
          ganho_planner: boolean | null
          ganho_planner_at: string | null
          ganho_pos: boolean | null
          ganho_pos_at: string | null
          ganho_sdr: boolean | null
          ganho_sdr_at: string | null
          id: string | null
          is_group_parent: boolean | null
          marketing_data: Json | null
          moeda: string | null
          orcamento: Json | null
          org_id: string | null
          origem: string | null
          parent_card_id: string | null
          parent_card_title: string | null
          pessoa_email: string | null
          pessoa_nome: string | null
          pessoa_principal_id: string | null
          pessoa_telefone: string | null
          pessoa_telefone_normalizado: string | null
          pipeline_id: string | null
          pipeline_nome: string | null
          pipeline_stage_id: string | null
          pos_owner_id: string | null
          prioridade: string | null
          prods_ready: number | null
          prods_total: number | null
          produto: Database["public"]["Enums"]["app_product"] | null
          produto_data: Json | null
          proxima_tarefa: Json | null
          receita: number | null
          receita_source: string | null
          sdr_nome: string | null
          sdr_owner_email: string | null
          sdr_owner_id: string | null
          sdr_owner_nome: string | null
          status_comercial: string | null
          status_taxa: string | null
          sub_card_category: string | null
          sub_card_status: string | null
          tag_ids: string[] | null
          tarefas_atrasadas: number | null
          tarefas_pendentes: number | null
          tempo_etapa_dias: number | null
          tempo_sem_contato: number | null
          titulo: string | null
          ultima_interacao: Json | null
          updated_at: string | null
          urgencia_tempo_etapa: number | null
          urgencia_viagem: number | null
          valor_display: number | null
          valor_estimado: number | null
          valor_final: number | null
          vendas_nome: string | null
          vendas_owner_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_dono_atual_id_profiles_fkey"
            columns: ["dono_atual_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_dono_atual_id_profiles_fkey"
            columns: ["dono_atual_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_dono_atual_id_profiles_fkey"
            columns: ["dono_atual_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_etapa_funil_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_etapa_funil_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "cards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "cards_parent_card_id_fkey"
            columns: ["parent_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pessoa_principal_id_fkey"
            columns: ["pessoa_principal_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pessoa_principal_id_fkey"
            columns: ["pessoa_principal_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "cards_pessoa_principal_id_fkey"
            columns: ["pessoa_principal_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_vendas_owner_id_profiles_fkey"
            columns: ["vendas_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_vendas_owner_id_profiles_fkey"
            columns: ["vendas_owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_vendas_owner_id_profiles_fkey"
            columns: ["vendas_owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      view_cards_contatos_summary: {
        Row: {
          card_id: string | null
          contatos: Json | null
          total_adultos: number | null
          total_criancas: number | null
          total_viajantes: number | null
        }
        Relationships: []
      }
      view_dashboard_funil: {
        Row: {
          etapa_nome: string | null
          etapa_ordem: number | null
          fase: string | null
          produto: Database["public"]["Enums"]["app_product"] | null
          receita_total: number | null
          stage_id: string | null
          sub_card_count: number | null
          total_cards: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      view_deleted_cards: {
        Row: {
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_nome: string | null
          etapa_nome: string | null
          id: string | null
          org_id: string | null
          pessoa_nome: string | null
          produto: Database["public"]["Enums"]["app_product"] | null
          status_comercial: string | null
          titulo: string | null
          valor_estimado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      view_deleted_contacts: {
        Row: {
          cpf: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_nome: string | null
          email: string | null
          id: string | null
          nome: string | null
          org_id: string | null
          sobrenome: string | null
          telefone: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa_enum"] | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "contatos_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      view_integration_classification: {
        Row: {
          change_type: string | null
          created_at: string | null
          entity_type: string | null
          id: string | null
          processing_mode: string | null
          processing_order: number | null
        }
        Insert: {
          change_type?: never
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          processing_mode?: never
          processing_order?: never
        }
        Update: {
          change_type?: never
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          processing_mode?: never
          processing_order?: never
        }
        Relationships: []
      }
      view_integration_router_audit: {
        Row: {
          count: number | null
          entity_type: string | null
          pipeline_id: string | null
          routing_status: string | null
          stage_id: string | null
        }
        Relationships: []
      }
      view_integration_would_apply: {
        Row: {
          change_type: string | null
          entity_type: string | null
          event_date: string | null
          external_id: string | null
          row_key: string | null
          target_unit: string | null
          would_action: string | null
        }
        Relationships: []
      }
      view_profiles_complete: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          created_at: string | null
          department_id: string | null
          department_name: string | null
          email: string | null
          id: string | null
          is_admin: boolean | null
          legacy_role: Database["public"]["Enums"]["app_role"] | null
          nome: string | null
          phone: string | null
          produtos: Database["public"]["Enums"]["app_product"][] | null
          role_color: string | null
          role_display_name: string | null
          role_id: string | null
          role_name: string | null
          team_color: string | null
          team_description: string | null
          team_id: string | null
          team_name: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      view_router_discovery_report: {
        Row: {
          ac_pipeline_id: string | null
          ac_stage_id: string | null
          event_count: number | null
          first_seen: string | null
          last_seen: string | null
          mapped_unit: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _a_owner_ok: {
        Args: { actual_id: string; arr_ids: string[]; single_id: string }
        Returns: boolean
      }
      _a_tag_ok: {
        Args: { card_id: string; tag_ids: string[] }
        Returns: boolean
      }
      _report_computed_measure_sql: {
        Args: { p_key: string; p_source: string }
        Returns: string
      }
      _report_resolve_field_sql: {
        Args: { p_field: string; p_source: string }
        Returns: string
      }
      _report_resolve_source: { Args: { p_source: string }; Returns: string }
      _report_validate_field: {
        Args: { p_field: string; p_source: string }
        Returns: boolean
      }
      analytics_drill_down_cards: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_drill_destino?: string
          p_drill_loss_reason?: string
          p_drill_owner_id?: string
          p_drill_period_end?: string
          p_drill_period_start?: string
          p_drill_phase?: string
          p_drill_source?: string
          p_drill_stage_id?: string
          p_drill_status?: string
          p_exclude_terminal?: boolean
          p_global_owner_id?: string
          p_global_stage_id?: string
          p_limit?: number
          p_mode?: string
          p_offset?: number
          p_owner_ids?: string[]
          p_product?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_tag_ids?: string[]
        }
        Returns: {
          created_at: string
          data_fechamento: string
          dono_atual_nome: string
          etapa_nome: string
          fase: string
          id: string
          pessoa_nome: string
          pessoa_telefone: string
          produto: string
          receita: number
          stage_entered_at: string
          status_comercial: string
          titulo: string
          total_count: number
          valor_display: number
        }[]
      }
      analytics_financial_breakdown: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_granularity?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          count_won: number
          period: string
          receita_sum: number
          ticket_medio: number
          valor_final_sum: number
        }[]
      }
      analytics_funnel_by_owner: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          card_count: number
          fase: string
          ordem: number
          owner_id: string
          owner_name: string
          receita_total: number
          stage_id: string
          stage_nome: string
          valor_total: number
        }[]
      }
      analytics_funnel_conversion: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          avg_days_in_stage: number
          current_count: number
          ordem: number
          p75_days_in_stage: number
          phase_slug: string
          stage_id: string
          stage_nome: string
          total_valor: number
        }[]
      }
      analytics_funnel_live: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          fase: string
          ordem: number
          receita_total: number
          stage_id: string
          stage_nome: string
          total_cards: number
          valor_total: number
        }[]
      }
      analytics_loss_reasons: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          count: number
          motivo: string
          percentage: number
        }[]
      }
      analytics_operations_summary: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      analytics_overview_kpis: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      analytics_pipeline_current: {
        Args: {
          p_date_ref?: string
          p_owner_ids?: string[]
          p_product?: string
          p_tag_ids?: string[]
          p_value_max?: number
          p_value_min?: number
        }
        Returns: Json
      }
      analytics_retention_cohort: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          cohort_month: string
          month_offset: number
          retained: number
          retention_rate: number
          total_contacts: number
        }[]
      }
      analytics_retention_kpis: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      analytics_revenue_by_product: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          count_won: number
          produto: string
          receita_total: number
          valor_total: number
        }[]
      }
      analytics_revenue_timeseries: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_granularity?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          count_won: number
          period: string
          period_start: string
          total_receita: number
          total_valor: number
        }[]
      }
      analytics_sla_summary: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          avg_hours_in_stage: number
          compliance_rate: number
          compliant_cards: number
          sla_hours: number
          stage_nome: string
          total_cards: number
          violating_cards: number
        }[]
      }
      analytics_sla_violations: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          card_id: string
          dias_na_etapa: number
          owner_nome: string
          sla_exceeded_hours: number
          sla_hours: number
          stage_nome: string
          titulo: string
        }[]
      }
      analytics_team_performance: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase?: string
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          active_cards: number
          ciclo_medio_dias: number
          conversion_rate: number
          lost_cards: number
          open_cards: number
          phase: string
          ticket_medio: number
          total_cards: number
          total_receita: number
          user_id: string
          user_nome: string
          won_cards: number
        }[]
      }
      analytics_top_destinations: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_tag_ids?: string[]
        }
        Returns: {
          destino: string
          receita_total: number
          total_cards: number
        }[]
      }
      analytics_whatsapp_conversations: {
        Args: {
          p_from?: string
          p_instance?: string
          p_limit?: number
          p_offset?: number
          p_owner_id?: string
          p_phase_slug?: string
          p_produto?: string
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_stage_id?: string
          p_status?: string
          p_tag_ids?: string[]
          p_to?: string
        }
        Returns: Json
      }
      analytics_whatsapp_metrics: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_mode?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
        }
        Returns: Json
      }
      analytics_whatsapp_speed: {
        Args: {
          p_from?: string
          p_granularity?: string
          p_owner_id?: string
          p_produto?: string
          p_tag_ids?: string[]
          p_to?: string
        }
        Returns: Json
      }
      analytics_whatsapp_v2: {
        Args: {
          p_from?: string
          p_granularity?: string
          p_owner_id?: string
          p_produto?: string
          p_tag_ids?: string[]
          p_to?: string
        }
        Returns: Json
      }
      apply_contact_quality_fixes: {
        Args: { p_fixes: Json }
        Returns: {
          error_count: number
          errors: string[]
          fixed_count: number
        }[]
      }
      audit_contact_quality: {
        Args: { p_issue_types?: string[]; p_limit?: number }
        Returns: {
          confidence: string
          contact_cpf: string
          contact_data_nascimento: string
          contact_email: string
          contact_id: string
          contact_nome: string
          contact_sobrenome: string
          issue_description: string
          issue_type: string
          suggested_data_nascimento: string
          suggested_nome: string
          suggested_sobrenome: string
        }[]
      }
      audit_contact_quality_counts: {
        Args: never
        Returns: {
          issue_count: number
          issue_type: string
        }[]
      }
      auto_expire_proposals: { Args: never; Returns: number }
      bulk_create_pos_venda_cards: {
        Args: { p_created_by: string; p_trips: Json }
        Returns: Json
      }
      bulk_import_financial_items: { Args: { p_cards: Json }; Returns: Json }
      calculate_business_due_date: {
        Args: {
          p_allowed_weekdays?: number[]
          p_bh_end?: number
          p_bh_start?: number
          p_delay_minutes: number
          p_delay_type?: string
          p_from: string
        }
        Returns: string
      }
      calculate_flight_base_price: {
        Args: { p_rich_content: Json }
        Returns: number
      }
      cancelar_sub_card: {
        Args: { p_motivo?: string; p_sub_card_id: string }
        Returns: Json
      }
      check_contact_duplicates: {
        Args: {
          p_cpf?: string
          p_email?: string
          p_exclude_id?: string
          p_nome?: string
          p_sobrenome?: string
          p_telefone?: string
        }
        Returns: {
          contact_cpf: string
          contact_email: string
          contact_id: string
          contact_nome: string
          contact_sobrenome: string
          contact_telefone: string
          match_strength: string
          match_type: string
        }[]
      }
      check_expiring_tasks_push: { Args: never; Returns: undefined }
      check_outbound_trigger: {
        Args: {
          p_event_type: string
          p_field_name?: string
          p_integration_id: string
          p_owner_id: string
          p_pipeline_id: string
          p_stage_id: string
          p_status: string
        }
        Returns: {
          action_mode: string
          action_type: string
          allowed: boolean
          reason: string
          rule_id: string
          rule_name: string
          sync_field_mode: string
          sync_fields: string[]
        }[]
      }
      check_overdue_tasks_push: { Args: never; Returns: undefined }
      check_upcoming_meetings_push: { Args: never; Returns: undefined }
      completar_sub_card: { Args: { p_sub_card_id: string }; Returns: Json }
      create_user_and_card: {
        Args: { p_name: string; p_phone: string; p_pipeline_stage_id?: string }
        Returns: Json
      }
      criar_card_oportunidade_futura: {
        Args: { p_future_opp_id: string }
        Returns: Json
      }
      criar_sub_card: {
        Args: {
          p_category?: string
          p_descricao: string
          p_merge_config?: Json
          p_mode?: string
          p_parent_id: string
          p_titulo: string
          p_valor_estimado?: number
        }
        Returns: Json
      }
      criar_sub_card_futuro: {
        Args: { p_future_opp_id: string }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_user: { Args: { user_id: string }; Returns: undefined }
      describe_table: {
        Args: { p_table: string }
        Returns: {
          column_name: string
          data_type: string
          is_nullable: string
        }[]
      }
      exec_sql: { Args: { query: string }; Returns: Json }
      execute_cadence_entry_rule_immediate: {
        Args: { p_card_id: string; p_trigger_id: string }
        Returns: Json
      }
      f_unaccent: { Args: { "": string }; Returns: string }
      find_contact_by_whatsapp: {
        Args: { p_convo_id: string; p_phone: string }
        Returns: string
      }
      find_jsonb_diffs: {
        Args: { p_new: Json; p_old: Json; p_path: string }
        Returns: Database["public"]["CompositeTypes"]["jsonb_diff_record"][]
        SetofOptions: {
          from: "*"
          to: "jsonb_diff_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fix_orphan_conversations: { Args: never; Returns: Json }
      fn_check_integration_health: { Args: never; Returns: Json }
      generate_api_key: {
        Args: {
          p_expires_at?: string
          p_name: string
          p_permissions?: Json
          p_rate_limit?: number
        }
        Returns: {
          api_key_id: string
          plain_text_key: string
        }[]
      }
      generate_invite: {
        Args: {
          p_created_by: string
          p_email: string
          p_produtos?: string[]
          p_role: string
          p_team_id: string
        }
        Returns: string
      }
      generate_proposal_public_token: { Args: never; Returns: string }
      get_ai_extraction_config: { Args: never; Returns: Json }
      get_ai_extraction_config_v2: {
        Args: { p_stage_id?: string }
        Returns: Json
      }
      get_all_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      get_all_views: {
        Args: never
        Returns: {
          view_name: string
        }[]
      }
      get_card_ids_by_stage_entry: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_product?: string
          p_stage_id: string
        }
        Returns: {
          card_id: string
        }[]
      }
      get_client_by_phone: {
        Args: {
          p_conversation_id?: string
          p_phone_with_9: string
          p_phone_without_9: string
        }
        Returns: Json
      }
      get_invite_details: { Args: { token_input: string }; Returns: Json }
      get_monde_sales_by_card: {
        Args: { p_card_id: string }
        Returns: {
          created_at: string
          items_count: number
          monde_sale_id: string
          sale_date: string
          sale_id: string
          status: string
          total_value: number
        }[]
      }
      get_outbound_external_field_id: {
        Args: { p_integration_id: string; p_internal_field: string }
        Returns: string
      }
      get_outbound_setting: { Args: { p_key: string }; Returns: string }
      get_outbound_trigger_event_stats: {
        Args: { p_integration_id: string }
        Returns: {
          cnt: number
          status: string
          trigger_id: string
        }[]
      }
      get_product_setting: {
        Args: { p_key: string; p_produto?: string }
        Returns: string
      }
      get_schema_summary: {
        Args: never
        Returns: {
          count: number
          resource_type: string
        }[]
      }
      get_sub_cards: { Args: { p_parent_id: string }; Returns: Json }
      get_travel_history:
        | {
            Args: { contact_id_param: string }
            Returns: {
              card_id: string
              companions: string[]
              data_viagem: string
              moeda: string
              role: string
              status: string
              titulo: string
              valor: number
            }[]
          }
        | {
            Args: { contact_ids: string[] }
            Returns: {
              card_id: string
              companions: string[]
              data_viagem: string
              moeda: string
              relevant_contacts: string[]
              role: string
              status: string
              titulo: string
              valor: number
            }[]
          }
      get_trigger_event_stats: {
        Args: { p_integration_id: string }
        Returns: {
          cnt: number
          status: string
          trigger_id: string
        }[]
      }
      get_trigger_with_validation_config: {
        Args: {
          p_integration_id: string
          p_owner_id?: string
          p_pipeline_id: string
          p_stage_id: string
        }
        Returns: {
          action_type: string
          bypass_validation: boolean
          quarantine_mode: string
          quarantine_stage_id: string
          target_pipeline_id: string
          target_stage_id: string
          trigger_id: string
          validation_level: string
        }[]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_whatsapp_conversation_messages: {
        Args: { p_contact_id: string; p_limit?: number }
        Returns: Json
      }
      has_role: { Args: { role_name: string }; Returns: boolean }
      increment_library_usage: {
        Args: { library_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      is_manager_or_admin: { Args: never; Returns: boolean }
      is_operational: { Args: never; Returns: boolean }
      is_proposal_flight_sold: {
        Args: { p_flight_id: string }
        Returns: boolean
      }
      is_proposal_item_sold: { Args: { p_item_id: string }; Returns: boolean }
      jsonb_get_path: { Args: { data: Json; path: string }; Returns: string }
      julia_assign_tag: {
        Args: { p_card_id: string; p_tag_color?: string; p_tag_name: string }
        Returns: Json
      }
      julia_check_calendar: {
        Args: { p_date_from?: string; p_date_to?: string; p_owner_id: string }
        Returns: Json
      }
      julia_request_handoff: {
        Args: {
          p_card_id: string
          p_context_summary?: string
          p_reason?: string
        }
        Returns: Json
      }
      list_all_tables: {
        Args: never
        Returns: {
          row_estimate: number
          table_name: string
        }[]
      }
      marcar_ganho: {
        Args: {
          p_card_id: string
          p_novo_dono_id?: string
          p_skip_pos_venda?: boolean
        }
        Returns: Json
      }
      marcar_perdido: {
        Args: {
          p_card_id: string
          p_motivo_perda_comentario?: string
          p_motivo_perda_id?: string
        }
        Returns: undefined
      }
      match_documents_v2: {
        Args: {
          filter: Json
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          char_end: number
          char_start: number
          chunk_id: string
          content: string
          document_id: string
          metadata: Json
          similarity: number
        }[]
      }
      merge_sub_card: {
        Args: { p_options?: Json; p_sub_card_id: string }
        Returns: Json
      }
      mover_card: {
        Args: {
          p_card_id: string
          p_motivo_perda_comentario?: string
          p_motivo_perda_id?: string
          p_nova_etapa_id: string
        }
        Returns: undefined
      }
      normalize_cpf: { Args: { cpf_input: string }; Returns: string }
      normalize_phone: { Args: { phone_number: string }; Returns: string }
      normalize_phone_brazil: {
        Args: { phone_number: string }
        Returns: string
      }
      normalize_phone_robust: { Args: { p_phone: string }; Returns: string[] }
      process_all_pending_whatsapp_events: { Args: never; Returns: Json }
      process_pending_whatsapp_events: { Args: never; Returns: Json }
      process_task_queue: { Args: never; Returns: number }
      process_whatsapp_raw_event: { Args: { event_id: string }; Returns: Json }
      process_whatsapp_raw_event_v2: {
        Args: { event_id: string }
        Returns: Json
      }
      reabrir_card: { Args: { p_card_id: string }; Returns: undefined }
      recalcular_financeiro_manual: {
        Args: { p_card_id: string }
        Returns: Json
      }
      recalcular_receita_card: { Args: { p_card_id: string }; Returns: Json }
      recalculate_contact_stats_for: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      report_drill_down: {
        Args: {
          p_config: Json
          p_date_end?: string
          p_date_start?: string
          p_drill_filters: Json
          p_owner_id?: string
          p_product?: string
        }
        Returns: Json
      }
      report_funnel_flow: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_owner_id?: string
          p_product?: string
        }
        Returns: Json
      }
      report_query_engine: {
        Args: {
          p_config: Json
          p_date_end?: string
          p_date_start?: string
          p_owner_id?: string
          p_product?: string
        }
        Returns: Json
      }
      report_stage_cohort: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_owner_id?: string
          p_product?: string
          p_stage_id: string
        }
        Returns: Json
      }
      reprocess_orphan_whatsapp_for_phone: {
        Args: { p_phone: string }
        Returns: Json
      }
      reprocess_pending_whatsapp_events: {
        Args: { batch_size?: number }
        Returns: Json
      }
      requesting_org_id: { Args: never; Returns: string }
      reset_user_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: undefined
      }
      revert_pos_venda_import_items: {
        Args: { p_item_ids: string[]; p_reverted_by: string }
        Returns: Json
      }
      revoke_api_key: { Args: { p_key_id: string }; Returns: boolean }
      safe_log_trigger_error: {
        Args: {
          p_context?: Json
          p_error_message: string
          p_function_name: string
        }
        Returns: undefined
      }
      sanitize_contact_names: {
        Args: { p_nome: string; p_sobrenome: string }
        Returns: {
          nome: string
          sobrenome: string
        }[]
      }
      search_proposal_library: {
        Args: {
          category_filter?: string
          destination_filter?: string
          limit_count?: number
          search_term: string
        }
        Returns: {
          base_price: number
          category: string
          content: Json
          created_at: string
          created_by: string
          currency: string
          destination: string
          id: string
          is_shared: boolean
          name: string
          similarity_score: number
          supplier: string
          tags: string[]
          thumbnail_url: string
          usage_count: number
        }[]
      }
      set_card_primary_contact: {
        Args: { p_card_id: string; p_contact_id: string }
        Returns: undefined
      }
      should_sync_field: {
        Args: {
          p_current_phase_id: string
          p_integration_id: string
          p_internal_field: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      smart_title_case: { Args: { name: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      update_card_from_ai_extraction: {
        Args: {
          p_briefing_inicial: Json
          p_card_id: string
          p_produto_data: Json
        }
        Returns: Json
      }
      update_user_email: {
        Args: { p_new_email: string; p_user_id: string }
        Returns: undefined
      }
      upsert_contacts_from_import: {
        Args: {
          p_contacts: Json
          p_created_by?: string
          p_origem_detalhe?: string
        }
        Returns: {
          error_count: number
          errors: string[]
          inserted_count: number
          skipped_count: number
          updated_count: number
        }[]
      }
      validate_api_key: {
        Args: { p_key: string }
        Returns: {
          current_count: number
          error_message: string
          is_valid: boolean
          key_id: string
          key_name: string
          permissions: Json
          rate_limit: number
        }[]
      }
      validate_cpf: { Args: { cpf: string }; Returns: boolean }
      validate_integration_gate: {
        Args: {
          p_card_data: Json
          p_source?: string
          p_target_stage_id: string
          p_validation_level?: string
        }
        Returns: {
          can_bypass: boolean
          missing_requirements: Json
          valid: boolean
        }[]
      }
      validate_transition: {
        Args: { p_card_id: string; p_target_stage_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_product: "TRIPS" | "WEDDING" | "CORP"
      app_role:
        | "admin"
        | "gestor"
        | "sdr"
        | "vendas"
        | "pos_venda"
        | "concierge"
        | "financeiro"
      proposal_item_type:
        | "hotel"
        | "flight"
        | "transfer"
        | "experience"
        | "service"
        | "insurance"
        | "fee"
        | "custom"
      proposal_section_type:
        | "cover"
        | "itinerary"
        | "flights"
        | "hotels"
        | "experiences"
        | "transfers"
        | "services"
        | "terms"
        | "summary"
        | "custom"
      proposal_status:
        | "draft"
        | "sent"
        | "viewed"
        | "in_progress"
        | "accepted"
        | "rejected"
        | "expired"
      requirement_type_enum: "field" | "proposal" | "task"
      tipo_pessoa_enum: "adulto" | "crianca"
      tipo_viajante_enum: "titular" | "acompanhante"
    }
    CompositeTypes: {
      jsonb_diff_record: {
        path: string | null
        old_value: string | null
        new_value: string | null
      }
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
      app_product: ["TRIPS", "WEDDING", "CORP"],
      app_role: [
        "admin",
        "gestor",
        "sdr",
        "vendas",
        "pos_venda",
        "concierge",
        "financeiro",
      ],
      proposal_item_type: [
        "hotel",
        "flight",
        "transfer",
        "experience",
        "service",
        "insurance",
        "fee",
        "custom",
      ],
      proposal_section_type: [
        "cover",
        "itinerary",
        "flights",
        "hotels",
        "experiences",
        "transfers",
        "services",
        "terms",
        "summary",
        "custom",
      ],
      proposal_status: [
        "draft",
        "sent",
        "viewed",
        "in_progress",
        "accepted",
        "rejected",
        "expired",
      ],
      requirement_type_enum: ["field", "proposal", "task"],
      tipo_pessoa_enum: ["adulto", "crianca"],
      tipo_viajante_enum: ["titular", "acompanhante"],
    },
  },
} as const
