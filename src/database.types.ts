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
      ai_agent_business_config: {
        Row: {
          agent_id: string
          auto_update_fields: Json | null
          calendar_config: Json | null
          calendar_system: string | null
          company_description: string | null
          company_name: string | null
          contact_update_fields: Json | null
          created_at: string | null
          custom_blocks: Json
          escalation_triggers: Json | null
          fee_presentation_timing: string | null
          form_data_fields: Json | null
          has_secondary_contacts: boolean | null
          id: string
          language: string | null
          methodology_text: string | null
          pricing_json: Json | null
          pricing_model: string | null
          process_steps: Json | null
          protected_fields: Json | null
          secondary_contact_fields: Json | null
          secondary_contact_role_name: string | null
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          auto_update_fields?: Json | null
          calendar_config?: Json | null
          calendar_system?: string | null
          company_description?: string | null
          company_name?: string | null
          contact_update_fields?: Json | null
          created_at?: string | null
          custom_blocks?: Json
          escalation_triggers?: Json | null
          fee_presentation_timing?: string | null
          form_data_fields?: Json | null
          has_secondary_contacts?: boolean | null
          id?: string
          language?: string | null
          methodology_text?: string | null
          pricing_json?: Json | null
          pricing_model?: string | null
          process_steps?: Json | null
          protected_fields?: Json | null
          secondary_contact_fields?: Json | null
          secondary_contact_role_name?: string | null
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          auto_update_fields?: Json | null
          calendar_config?: Json | null
          calendar_system?: string | null
          company_description?: string | null
          company_name?: string | null
          contact_update_fields?: Json | null
          created_at?: string | null
          custom_blocks?: Json
          escalation_triggers?: Json | null
          fee_presentation_timing?: string | null
          form_data_fields?: Json | null
          has_secondary_contacts?: boolean | null
          id?: string
          language?: string | null
          methodology_text?: string | null
          pricing_json?: Json | null
          pricing_model?: string | null
          process_steps?: Json | null
          protected_fields?: Json | null
          secondary_contact_fields?: Json | null
          secondary_contact_role_name?: string | null
          tone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_business_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_business_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_business_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_few_shot_examples: {
        Row: {
          agent_id: string
          agent_response: string
          context_note: string | null
          created_at: string
          display_order: number
          enabled: boolean
          id: string
          lead_message: string
          related_moment_key: string | null
          related_signal_key: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_response: string
          context_note?: string | null
          created_at?: string
          display_order?: number
          enabled?: boolean
          id?: string
          lead_message: string
          related_moment_key?: string | null
          related_signal_key?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_response?: string
          context_note?: string | null
          created_at?: string
          display_order?: number
          enabled?: boolean
          id?: string
          lead_message?: string
          related_moment_key?: string | null
          related_signal_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_few_shot_examples_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_few_shot_examples_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_few_shot_examples_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_kb_links: {
        Row: {
          agent_id: string
          created_at: string | null
          id: string
          kb_id: string
          org_id: string
          shared_with_account: boolean
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          id?: string
          kb_id: string
          org_id?: string
          shared_with_account?: boolean
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          id?: string
          kb_id?: string
          org_id?: string
          shared_with_account?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_kb_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_kb_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_kb_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_kb_links_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_kb_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_knowledge_bases: {
        Row: {
          agent_id: string
          created_at: string
          enabled: boolean
          id: string
          kb_id: string
          org_id: string
          priority: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          kb_id: string
          org_id?: string
          priority?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          kb_id?: string
          org_id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_knowledge_bases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_bases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_bases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_bases_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_metrics: {
        Row: {
          agent_id: string
          avg_conversation_duration_seconds: number | null
          avg_response_time_ms: number | null
          avg_sentiment_score: number | null
          avg_turns_per_conversation: number | null
          bookings_influenced: number | null
          conversations_completed: number | null
          conversations_escalated: number | null
          conversations_started: number | null
          created_at: string | null
          customer_satisfaction_score: number | null
          date_bucket: string
          fallback_rate: number | null
          first_contact_resolution_rate: number | null
          handoff_rate: number | null
          id: string
          leads_qualified: number | null
          period: string | null
          proposals_generated: number | null
          resolution_rate: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
        }
        Insert: {
          agent_id: string
          avg_conversation_duration_seconds?: number | null
          avg_response_time_ms?: number | null
          avg_sentiment_score?: number | null
          avg_turns_per_conversation?: number | null
          bookings_influenced?: number | null
          conversations_completed?: number | null
          conversations_escalated?: number | null
          conversations_started?: number | null
          created_at?: string | null
          customer_satisfaction_score?: number | null
          date_bucket: string
          fallback_rate?: number | null
          first_contact_resolution_rate?: number | null
          handoff_rate?: number | null
          id?: string
          leads_qualified?: number | null
          period?: string | null
          proposals_generated?: number | null
          resolution_rate?: number | null
          total_input_tokens?: number | null
          total_output_tokens?: number | null
        }
        Update: {
          agent_id?: string
          avg_conversation_duration_seconds?: number | null
          avg_response_time_ms?: number | null
          avg_sentiment_score?: number | null
          avg_turns_per_conversation?: number | null
          bookings_influenced?: number | null
          conversations_completed?: number | null
          conversations_escalated?: number | null
          conversations_started?: number | null
          created_at?: string | null
          customer_satisfaction_score?: number | null
          date_bucket?: string
          fallback_rate?: number | null
          first_contact_resolution_rate?: number | null
          handoff_rate?: number | null
          id?: string
          leads_qualified?: number | null
          period?: string | null
          proposals_generated?: number | null
          resolution_rate?: number | null
          total_input_tokens?: number | null
          total_output_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_metrics_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_moments: {
        Row: {
          agent_id: string
          anchor_text: string | null
          collects_fields: string[]
          created_at: string
          discovery_config: Json | null
          display_order: number
          enabled: boolean
          id: string
          kind: string
          message_mode: string
          moment_key: string
          moment_label: string
          red_lines: string[]
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          anchor_text?: string | null
          collects_fields?: string[]
          created_at?: string
          discovery_config?: Json | null
          display_order: number
          enabled?: boolean
          id?: string
          kind?: string
          message_mode?: string
          moment_key: string
          moment_label: string
          red_lines?: string[]
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          anchor_text?: string | null
          collects_fields?: string[]
          created_at?: string
          discovery_config?: Json | null
          display_order?: number
          enabled?: boolean
          id?: string
          kind?: string
          message_mode?: string
          moment_key?: string
          moment_label?: string
          red_lines?: string[]
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_moments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_moments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_moments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_phone_line_config: {
        Row: {
          agent_id: string
          ativa: boolean | null
          created_at: string | null
          id: string
          phone_line_id: string
          priority: number | null
          routing_filter: Json | null
        }
        Insert: {
          agent_id: string
          ativa?: boolean | null
          created_at?: string | null
          id?: string
          phone_line_id: string
          priority?: number | null
          routing_filter?: Json | null
        }
        Update: {
          agent_id?: string
          ativa?: boolean | null
          created_at?: string | null
          id?: string
          phone_line_id?: string
          priority?: number | null
          routing_filter?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_phone_line_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_phone_line_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_phone_line_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_phone_line"
            columns: ["phone_line_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_linha_config"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_presentations: {
        Row: {
          agent_id: string
          concept_text: string | null
          created_at: string
          enabled: boolean
          fixed_template: string | null
          id: string
          mode: string
          scenario: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          concept_text?: string | null
          created_at?: string
          enabled?: boolean
          fixed_template?: string | null
          id?: string
          mode: string
          scenario: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          concept_text?: string | null
          created_at?: string
          enabled?: boolean
          fixed_template?: string | null
          id?: string
          mode?: string
          scenario?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_presentations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_presentations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_presentations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_prompts: {
        Row: {
          agent_id: string
          avg_resolution_rate: number | null
          avg_sentiment_score: number | null
          avg_turn_count: number | null
          created_at: string | null
          created_by: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          is_variant: boolean | null
          system_prompt: string
          total_conversations: number | null
          updated_at: string | null
          variant_name: string | null
          version: number
        }
        Insert: {
          agent_id: string
          avg_resolution_rate?: number | null
          avg_sentiment_score?: number | null
          avg_turn_count?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          is_variant?: boolean | null
          system_prompt: string
          total_conversations?: number | null
          updated_at?: string | null
          variant_name?: string | null
          version: number
        }
        Update: {
          agent_id?: string
          avg_resolution_rate?: number | null
          avg_sentiment_score?: number | null
          avg_turn_count?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          is_variant?: boolean | null
          system_prompt?: string
          total_conversations?: number | null
          updated_at?: string | null
          variant_name?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_prompts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_prompts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_prompts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "ai_agent_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_qualification_flow: {
        Row: {
          advance_condition: string | null
          advance_to_stage_id: string | null
          agent_id: string
          created_at: string | null
          disqualification_triggers: Json | null
          id: string
          maps_to_field: string | null
          question: string
          response_options: Json | null
          skip_if_filled: boolean | null
          stage_key: string | null
          stage_name: string
          stage_order: number
          subquestions: Json | null
        }
        Insert: {
          advance_condition?: string | null
          advance_to_stage_id?: string | null
          agent_id: string
          created_at?: string | null
          disqualification_triggers?: Json | null
          id?: string
          maps_to_field?: string | null
          question: string
          response_options?: Json | null
          skip_if_filled?: boolean | null
          stage_key?: string | null
          stage_name: string
          stage_order: number
          subquestions?: Json | null
        }
        Update: {
          advance_condition?: string | null
          advance_to_stage_id?: string | null
          agent_id?: string
          created_at?: string | null
          disqualification_triggers?: Json | null
          id?: string
          maps_to_field?: string | null
          question?: string
          response_options?: Json | null
          skip_if_filled?: boolean | null
          stage_key?: string | null
          stage_name?: string
          stage_order?: number
          subquestions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_qualification_flow_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_qualification_flow_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_qualification_flow_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_scoring_config: {
        Row: {
          agent_id: string
          enabled: boolean
          fallback_action: string | null
          max_sinal_bonus: number | null
          org_id: string
          threshold_qualify: number
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          enabled?: boolean
          fallback_action?: string | null
          max_sinal_bonus?: number | null
          org_id?: string
          threshold_qualify?: number
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          enabled?: boolean
          fallback_action?: string | null
          max_sinal_bonus?: number | null
          org_id?: string
          threshold_qualify?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_scoring_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_scoring_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_scoring_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_scoring_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_scoring_rules: {
        Row: {
          agent_id: string
          ativa: boolean | null
          condition_type: string
          condition_value: Json
          created_at: string | null
          dimension: string
          id: string
          label: string | null
          ordem: number | null
          org_id: string
          rule_type: string
          updated_at: string | null
          weight: number
        }
        Insert: {
          agent_id: string
          ativa?: boolean | null
          condition_type: string
          condition_value: Json
          created_at?: string | null
          dimension: string
          id?: string
          label?: string | null
          ordem?: number | null
          org_id?: string
          rule_type?: string
          updated_at?: string | null
          weight: number
        }
        Update: {
          agent_id?: string
          ativa?: boolean | null
          condition_type?: string
          condition_value?: Json
          created_at?: string | null
          dimension?: string
          id?: string
          label?: string | null
          ordem?: number | null
          org_id?: string
          rule_type?: string
          updated_at?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_scoring_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_scoring_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_scoring_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_scoring_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_silent_signals: {
        Row: {
          agent_id: string
          created_at: string
          crm_field_key: string | null
          detection_hint: string
          display_order: number
          enabled: boolean
          how_to_use: string | null
          id: string
          signal_key: string
          signal_label: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          crm_field_key?: string | null
          detection_hint: string
          display_order?: number
          enabled?: boolean
          how_to_use?: string | null
          id?: string
          signal_key: string
          signal_label: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          crm_field_key?: string | null
          detection_hint?: string
          display_order?: number
          enabled?: boolean
          how_to_use?: string | null
          id?: string
          signal_key?: string
          signal_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_silent_signals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_silent_signals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_silent_signals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_skills: {
        Row: {
          agent_id: string
          config_override: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          priority: number | null
          skill_id: string
        }
        Insert: {
          agent_id: string
          config_override?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          priority?: number | null
          skill_id: string
        }
        Update: {
          agent_id?: string
          config_override?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          priority?: number | null
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "ai_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_special_scenarios: {
        Row: {
          agent_id: string
          auto_assign_tag: string | null
          auto_notify_responsible: boolean
          auto_transition_stage_id: string | null
          created_at: string | null
          enabled: boolean | null
          handoff_message: string | null
          id: string
          priority: number | null
          response_adjustment: string | null
          scenario_name: string
          simplified_qualification: Json | null
          skip_fee_presentation: boolean | null
          skip_meeting_scheduling: boolean | null
          target_agent_id: string | null
          trigger_config: Json
          trigger_description: string | null
          trigger_type: string
        }
        Insert: {
          agent_id: string
          auto_assign_tag?: string | null
          auto_notify_responsible?: boolean
          auto_transition_stage_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          handoff_message?: string | null
          id?: string
          priority?: number | null
          response_adjustment?: string | null
          scenario_name: string
          simplified_qualification?: Json | null
          skip_fee_presentation?: boolean | null
          skip_meeting_scheduling?: boolean | null
          target_agent_id?: string | null
          trigger_config?: Json
          trigger_description?: string | null
          trigger_type: string
        }
        Update: {
          agent_id?: string
          auto_assign_tag?: string | null
          auto_notify_responsible?: boolean
          auto_transition_stage_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          handoff_message?: string | null
          id?: string
          priority?: number | null
          response_adjustment?: string | null
          scenario_name?: string
          simplified_qualification?: Json | null
          skip_fee_presentation?: boolean | null
          skip_meeting_scheduling?: boolean | null
          target_agent_id?: string | null
          trigger_config?: Json
          trigger_description?: string | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_special_scenarios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_auto_transition_stage_id_fkey"
            columns: ["auto_transition_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_auto_transition_stage_id_fkey"
            columns: ["auto_transition_stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_special_scenarios_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_templates: {
        Row: {
          categoria: string
          created_at: string | null
          default_business_config: Json | null
          default_escalation_rules: Json | null
          default_playbook_structure: Json | null
          default_qualification_flow: Json | null
          default_routing_criteria: Json | null
          default_skills: Json | null
          default_special_scenarios: Json | null
          descricao: string | null
          icon_name: string | null
          id: string
          is_public: boolean | null
          is_system: boolean | null
          nome: string
          org_id: string | null
          preview_conversation: Json | null
          prompt_backoffice_template: string
          prompt_data_template: string
          prompt_formatter_template: string | null
          prompt_persona_template: string
          prompt_validator_template: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          categoria: string
          created_at?: string | null
          default_business_config?: Json | null
          default_escalation_rules?: Json | null
          default_playbook_structure?: Json | null
          default_qualification_flow?: Json | null
          default_routing_criteria?: Json | null
          default_skills?: Json | null
          default_special_scenarios?: Json | null
          descricao?: string | null
          icon_name?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          nome: string
          org_id?: string | null
          preview_conversation?: Json | null
          prompt_backoffice_template: string
          prompt_data_template: string
          prompt_formatter_template?: string | null
          prompt_persona_template: string
          prompt_validator_template?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string | null
          default_business_config?: Json | null
          default_escalation_rules?: Json | null
          default_playbook_structure?: Json | null
          default_qualification_flow?: Json | null
          default_routing_criteria?: Json | null
          default_skills?: Json | null
          default_special_scenarios?: Json | null
          descricao?: string | null
          icon_name?: string | null
          id?: string
          is_public?: boolean | null
          is_system?: boolean | null
          nome?: string
          org_id?: string | null
          preview_conversation?: Json | null
          prompt_backoffice_template?: string
          prompt_data_template?: string
          prompt_formatter_template?: string | null
          prompt_persona_template?: string
          prompt_validator_template?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_wizard_drafts: {
        Row: {
          agent_id: string | null
          created_at: string | null
          current_step: number | null
          id: string
          org_id: string
          status: string | null
          step_data: Json | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          org_id?: string
          status?: string | null
          step_data?: Json | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          org_id?: string
          status?: string | null
          step_data?: Json | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_wizard_drafts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_wizard_drafts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agent_wizard_drafts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_wizard_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_wizard_drafts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          ativa: boolean | null
          ativa_changed_at: string | null
          ativa_changed_by: string | null
          boundaries_config: Json | null
          context_fields_config: Json | null
          created_at: string | null
          created_by: string | null
          descricao: string | null
          escalation_rules: Json | null
          execution_backend: string
          external_config: Json | null
          fallback_agent_id: string | null
          fallback_message: string | null
          first_message_config: Json | null
          handoff_actions: Json | null
          handoff_signals: Json | null
          id: string
          identity_config: Json | null
          intelligent_decisions: Json | null
          interaction_mode: string | null
          is_template_based: boolean | null
          max_tokens: number | null
          memory_config: Json | null
          modelo: string
          multimodal_config: Json | null
          n8n_webhook_url: string | null
          nome: string
          org_id: string
          outbound_trigger_config: Json | null
          persona: string | null
          pipeline_models: Json | null
          playbook_enabled: boolean
          produto: Database["public"]["Enums"]["app_product"]
          prompts_extra: Json
          routing_criteria: Json | null
          system_prompt: string
          system_prompt_version: number | null
          temperature: number | null
          template_id: string | null
          test_mode_phone_whitelist: string[] | null
          timings: Json | null
          tipo: string
          updated_at: string | null
          validator_rules: Json | null
          voice_config: Json | null
        }
        Insert: {
          ativa?: boolean | null
          ativa_changed_at?: string | null
          ativa_changed_by?: string | null
          boundaries_config?: Json | null
          context_fields_config?: Json | null
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          escalation_rules?: Json | null
          execution_backend?: string
          external_config?: Json | null
          fallback_agent_id?: string | null
          fallback_message?: string | null
          first_message_config?: Json | null
          handoff_actions?: Json | null
          handoff_signals?: Json | null
          id?: string
          identity_config?: Json | null
          intelligent_decisions?: Json | null
          interaction_mode?: string | null
          is_template_based?: boolean | null
          max_tokens?: number | null
          memory_config?: Json | null
          modelo?: string
          multimodal_config?: Json | null
          n8n_webhook_url?: string | null
          nome: string
          org_id?: string
          outbound_trigger_config?: Json | null
          persona?: string | null
          pipeline_models?: Json | null
          playbook_enabled?: boolean
          produto: Database["public"]["Enums"]["app_product"]
          prompts_extra?: Json
          routing_criteria?: Json | null
          system_prompt: string
          system_prompt_version?: number | null
          temperature?: number | null
          template_id?: string | null
          test_mode_phone_whitelist?: string[] | null
          timings?: Json | null
          tipo: string
          updated_at?: string | null
          validator_rules?: Json | null
          voice_config?: Json | null
        }
        Update: {
          ativa?: boolean | null
          ativa_changed_at?: string | null
          ativa_changed_by?: string | null
          boundaries_config?: Json | null
          context_fields_config?: Json | null
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          escalation_rules?: Json | null
          execution_backend?: string
          external_config?: Json | null
          fallback_agent_id?: string | null
          fallback_message?: string | null
          first_message_config?: Json | null
          handoff_actions?: Json | null
          handoff_signals?: Json | null
          id?: string
          identity_config?: Json | null
          intelligent_decisions?: Json | null
          interaction_mode?: string | null
          is_template_based?: boolean | null
          max_tokens?: number | null
          memory_config?: Json | null
          modelo?: string
          multimodal_config?: Json | null
          n8n_webhook_url?: string | null
          nome?: string
          org_id?: string
          outbound_trigger_config?: Json | null
          persona?: string | null
          pipeline_models?: Json | null
          playbook_enabled?: boolean
          produto?: Database["public"]["Enums"]["app_product"]
          prompts_extra?: Json
          routing_criteria?: Json | null
          system_prompt?: string
          system_prompt_version?: number | null
          temperature?: number | null
          template_id?: string | null
          test_mode_phone_whitelist?: string[] | null
          timings?: Json | null
          tipo?: string
          updated_at?: string | null
          validator_rules?: Json | null
          voice_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_ativa_changed_by_fkey"
            columns: ["ativa_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_ativa_changed_by_fkey"
            columns: ["ativa_changed_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "ai_agents_ativa_changed_by_fkey"
            columns: ["ativa_changed_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "ai_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_fallback_agent_id_fkey"
            columns: ["fallback_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agents_fallback_agent_id_fkey"
            columns: ["fallback_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_agents_fallback_agent_id_fkey"
            columns: ["fallback_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_agents_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_state: {
        Row: {
          conversation_id: string
          current_topic: string | null
          extracted_variables: Json | null
          id: string
          last_moment_key: string | null
          last_moment_updated_at: string | null
          pending_actions: Json | null
          preferences: Json | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          conversation_id: string
          current_topic?: string | null
          extracted_variables?: Json | null
          id?: string
          last_moment_key?: string | null
          last_moment_updated_at?: string | null
          pending_actions?: Json | null
          preferences?: Json | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          conversation_id?: string
          current_topic?: string | null
          extracted_variables?: Json | null
          id?: string
          last_moment_key?: string | null
          last_moment_updated_at?: string | null
          pending_actions?: Json | null
          preferences?: Json | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_turns: {
        Row: {
          agent_id: string | null
          agent_version: string
          confidence: number | null
          content: string
          context_used: Json | null
          conversation_id: string
          created_at: string | null
          current_moment_key: string | null
          detected_intent: string | null
          detected_sentiment: string | null
          id: string
          input_tokens: number | null
          is_fallback: boolean | null
          moment_detection_method: string | null
          moment_transition_reason: string | null
          output_tokens: number | null
          qualification_score_at_turn: number | null
          reasoning: string | null
          role: string
          skills_used: Json | null
        }
        Insert: {
          agent_id?: string | null
          agent_version?: string
          confidence?: number | null
          content: string
          context_used?: Json | null
          conversation_id: string
          created_at?: string | null
          current_moment_key?: string | null
          detected_intent?: string | null
          detected_sentiment?: string | null
          id?: string
          input_tokens?: number | null
          is_fallback?: boolean | null
          moment_detection_method?: string | null
          moment_transition_reason?: string | null
          output_tokens?: number | null
          qualification_score_at_turn?: number | null
          reasoning?: string | null
          role: string
          skills_used?: Json | null
        }
        Update: {
          agent_id?: string | null
          agent_version?: string
          confidence?: number | null
          content?: string
          context_used?: Json | null
          conversation_id?: string
          created_at?: string | null
          current_moment_key?: string | null
          detected_intent?: string | null
          detected_sentiment?: string | null
          id?: string
          input_tokens?: number | null
          is_fallback?: boolean | null
          moment_detection_method?: string | null
          moment_transition_reason?: string | null
          output_tokens?: number | null
          qualification_score_at_turn?: number | null
          reasoning?: string | null
          role?: string
          skills_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_turns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_conversation_turns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_conversation_turns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversation_turns_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          ai_message_count: number | null
          card_id: string | null
          contact_id: string | null
          created_at: string | null
          current_agent_id: string | null
          ended_at: string | null
          escalation_at: string | null
          escalation_reason: string | null
          human_agent_id: string | null
          human_message_count: number | null
          id: string
          intent: string | null
          message_count: number | null
          org_id: string
          phone_number_id: string | null
          primary_agent_id: string | null
          resolution_status: string | null
          started_at: string | null
          status: string
          tags: Json | null
          updated_at: string | null
        }
        Insert: {
          ai_message_count?: number | null
          card_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_agent_id?: string | null
          ended_at?: string | null
          escalation_at?: string | null
          escalation_reason?: string | null
          human_agent_id?: string | null
          human_message_count?: number | null
          id?: string
          intent?: string | null
          message_count?: number | null
          org_id?: string
          phone_number_id?: string | null
          primary_agent_id?: string | null
          resolution_status?: string | null
          started_at?: string | null
          status?: string
          tags?: Json | null
          updated_at?: string | null
        }
        Update: {
          ai_message_count?: number | null
          card_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_agent_id?: string | null
          ended_at?: string | null
          escalation_at?: string | null
          escalation_reason?: string | null
          human_agent_id?: string | null
          human_message_count?: number | null
          id?: string
          intent?: string | null
          message_count?: number | null
          org_id?: string
          phone_number_id?: string | null
          primary_agent_id?: string | null
          resolution_status?: string | null
          started_at?: string | null
          status?: string
          tags?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_current_agent_id_fkey"
            columns: ["current_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_conversations_current_agent_id_fkey"
            columns: ["current_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_conversations_current_agent_id_fkey"
            columns: ["current_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_human_agent_id_fkey"
            columns: ["human_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_human_agent_id_fkey"
            columns: ["human_agent_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "ai_conversations_human_agent_id_fkey"
            columns: ["human_agent_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_primary_agent_id_fkey"
            columns: ["primary_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_conversations_primary_agent_id_fkey"
            columns: ["primary_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_conversations_primary_agent_id_fkey"
            columns: ["primary_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_conv_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_conv_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_conv_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_conv_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "fk_ai_conv_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_conv_contato"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ai_conv_contato"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fk_ai_conv_contato"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
        ]
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
      ai_knowledge_base_items: {
        Row: {
          ativa: boolean | null
          conteudo: string
          created_at: string | null
          embedding: string | null
          id: string
          kb_id: string
          ordem: number | null
          tags: Json | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          ativa?: boolean | null
          conteudo: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          kb_id: string
          ordem?: number | null
          tags?: Json | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          ativa?: boolean | null
          conteudo?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          kb_id?: string
          ordem?: number | null
          tags?: Json | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_items_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_bases: {
        Row: {
          ativa: boolean | null
          created_at: string | null
          created_by: string | null
          descricao: string | null
          embedding_model: string | null
          id: string
          last_synced_at: string | null
          nome: string
          org_id: string
          produto: Database["public"]["Enums"]["app_product"] | null
          tags: Json | null
          tipo: string
        }
        Insert: {
          ativa?: boolean | null
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          embedding_model?: string | null
          id?: string
          last_synced_at?: string | null
          nome: string
          org_id?: string
          produto?: Database["public"]["Enums"]["app_product"] | null
          tags?: Json | null
          tipo: string
        }
        Update: {
          ativa?: boolean | null
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          embedding_model?: string | null
          id?: string
          last_synced_at?: string | null
          nome?: string
          org_id?: string
          produto?: Database["public"]["Enums"]["app_product"] | null
          tags?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_bases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_bases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "ai_knowledge_bases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_message_buffer: {
        Row: {
          contact_name: string | null
          contact_phone: string
          created_at: string | null
          echo_conversation_id: string | null
          id: string
          media_url: string | null
          message_text: string
          message_type: string | null
          metadata: Json | null
          org_id: string
          phone_number_id: string | null
          processed: boolean | null
          processed_at: string | null
          raw_payload: Json | null
          whatsapp_message_id: string | null
        }
        Insert: {
          contact_name?: string | null
          contact_phone: string
          created_at?: string | null
          echo_conversation_id?: string | null
          id?: string
          media_url?: string | null
          message_text: string
          message_type?: string | null
          metadata?: Json | null
          org_id?: string
          phone_number_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
          whatsapp_message_id?: string | null
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string
          created_at?: string | null
          echo_conversation_id?: string | null
          id?: string
          media_url?: string | null
          message_text?: string
          message_type?: string | null
          metadata?: Json | null
          org_id?: string
          phone_number_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_message_buffer_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_outbound_queue: {
        Row: {
          agent_id: string
          attempts: number | null
          card_id: string
          contact_name: string | null
          contact_phone: string
          contato_id: string
          created_at: string | null
          error_message: string | null
          form_data: Json | null
          id: string
          max_attempts: number | null
          next_retry_at: string | null
          org_id: string
          processed_at: string | null
          scheduled_for: string | null
          status: string
          trigger_metadata: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          attempts?: number | null
          card_id: string
          contact_name?: string | null
          contact_phone: string
          contato_id: string
          created_at?: string | null
          error_message?: string | null
          form_data?: Json | null
          id?: string
          max_attempts?: number | null
          next_retry_at?: string | null
          org_id?: string
          processed_at?: string | null
          scheduled_for?: string | null
          status?: string
          trigger_metadata?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          attempts?: number | null
          card_id?: string
          contact_name?: string | null
          contact_phone?: string
          contato_id?: string
          created_at?: string | null
          error_message?: string | null
          form_data?: Json | null
          id?: string
          max_attempts?: number | null
          next_retry_at?: string | null
          org_id?: string
          processed_at?: string | null
          scheduled_for?: string | null
          status?: string
          trigger_metadata?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_outbound_queue_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_outbound_queue_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_outbound_queue_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outbound_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_card"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_contato"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_contato"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fk_outbound_queue_contato"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_skill_usage_logs: {
        Row: {
          agent_id: string
          conversation_turn_id: string | null
          created_at: string | null
          duration_ms: number | null
          error: string | null
          id: string
          input: Json | null
          output: Json | null
          skill_id: string
          success: boolean | null
        }
        Insert: {
          agent_id: string
          conversation_turn_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          skill_id: string
          success?: boolean | null
        }
        Update: {
          agent_id?: string
          conversation_turn_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json | null
          output?: Json | null
          skill_id?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_skill_usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_health_stats"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_skill_usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_v1_v2_comparison"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "ai_skill_usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_skill_usage_logs_conversation_turn_id_fkey"
            columns: ["conversation_turn_id"]
            isOneToOne: false
            referencedRelation: "ai_conversation_turns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_skill_usage_logs_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "ai_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_skills: {
        Row: {
          ativa: boolean | null
          categoria: string
          config: Json
          created_at: string | null
          created_by: string | null
          descricao: string | null
          examples: Json | null
          id: string
          input_schema: Json
          nome: string
          org_id: string
          output_schema: Json
          rate_limit_per_hour: number | null
          tipo: string
        }
        Insert: {
          ativa?: boolean | null
          categoria: string
          config?: Json
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          examples?: Json | null
          id?: string
          input_schema?: Json
          nome: string
          org_id?: string
          output_schema?: Json
          rate_limit_per_hour?: number | null
          tipo: string
        }
        Update: {
          ativa?: boolean | null
          categoria?: string
          config?: Json
          created_at?: string | null
          created_by?: string | null
          descricao?: string | null
          examples?: Json | null
          id?: string
          input_schema?: Json
          nome?: string
          org_id?: string
          output_schema?: Json
          rate_limit_per_hour?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "ai_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_skills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_saved_views: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          query_spec: Json
          updated_at: string
          user_id: string
          viz: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id?: string
          query_spec: Json
          updated_at?: string
          user_id: string
          viz?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          query_spec?: Json
          updated_at?: string
          user_id?: string
          viz?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_saved_views_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "analytics_saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_targets: {
        Row: {
          created_at: string | null
          id: string
          metric_key: string
          month: string
          org_id: string
          produto: string
          target_value: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric_key: string
          month: string
          org_id: string
          produto: string
          target_value: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metric_key?: string
          month?: string
          org_id?: string
          produto?: string
          target_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_targets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      auth_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: unknown
          success: boolean
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: unknown
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: unknown
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
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
          org_id: string
          priority: number | null
          target_template_id: string | null
          task_config: Json | null
          task_configs: Json
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
          org_id?: string
          priority?: number | null
          target_template_id?: string | null
          task_config?: Json | null
          task_configs?: Json
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
          org_id?: string
          priority?: number | null
          target_template_id?: string | null
          task_config?: Json | null
          task_configs?: Json
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cadence_event_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          block_index: number
          branch_config: Json | null
          created_at: string | null
          day_offset: number | null
          due_offset: Json | null
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
          block_index?: number
          branch_config?: Json | null
          created_at?: string | null
          day_offset?: number | null
          due_offset?: Json | null
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
          block_index?: number
          branch_config?: Json | null
          created_at?: string | null
          day_offset?: number | null
          due_offset?: Json | null
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
          execution_mode: string
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
          execution_mode?: string
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
          execution_mode?: string
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
      card_alert_rules: {
        Row: {
          body_template: string | null
          condition: Json
          created_at: string
          created_by: string | null
          daily_time: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          phase_id: string | null
          pipeline_id: string | null
          product: string | null
          send_email: boolean
          severity: string
          stage_id: string | null
          title_template: string
          trigger_mode: string
          updated_at: string
        }
        Insert: {
          body_template?: string | null
          condition?: Json
          created_at?: string
          created_by?: string | null
          daily_time?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          phase_id?: string | null
          pipeline_id?: string | null
          product?: string | null
          send_email?: boolean
          severity?: string
          stage_id?: string | null
          title_template: string
          trigger_mode?: string
          updated_at?: string
        }
        Update: {
          body_template?: string | null
          condition?: Json
          created_at?: string
          created_by?: string | null
          daily_time?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          phase_id?: string | null
          pipeline_id?: string | null
          product?: string | null
          send_email?: boolean
          severity?: string
          stage_id?: string | null
          title_template?: string
          trigger_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_alert_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_alert_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_alert_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_alert_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_alert_rules_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_alert_rules_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_alert_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_alert_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "view_dashboard_funil"
            referencedColumns: ["stage_id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "card_auto_creation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "card_gift_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "card_gift_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      card_milestones: {
        Row: {
          achieved_at: string
          achieved_by: string | null
          card_id: string
          id: string
          milestone_key: string
          org_id: string
        }
        Insert: {
          achieved_at?: string
          achieved_by?: string | null
          card_id: string
          id?: string
          milestone_key: string
          org_id?: string
        }
        Update: {
          achieved_at?: string
          achieved_by?: string | null
          card_id?: string
          id?: string
          milestone_key?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_milestones_achieved_by_fkey"
            columns: ["achieved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_milestones_achieved_by_fkey"
            columns: ["achieved_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_milestones_achieved_by_fkey"
            columns: ["achieved_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_milestones_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_milestones_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_milestones_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_milestones_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_milestones_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_milestones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      card_opens: {
        Row: {
          card_id: string
          first_opened_at: string
          id: string
          last_opened_at: string
          open_count: number
          org_id: string | null
          user_id: string
        }
        Insert: {
          card_id: string
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          open_count?: number
          org_id?: string | null
          user_id: string
        }
        Update: {
          card_id?: string
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          open_count?: number
          org_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_opens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_opens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_opens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_opens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_opens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_opens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
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
      card_phase_owners: {
        Row: {
          assigned_at: string
          card_id: string
          org_id: string
          owner_id: string
          phase_id: string
        }
        Insert: {
          assigned_at?: string
          card_id: string
          org_id?: string
          owner_id: string
          phase_id: string
        }
        Update: {
          assigned_at?: string
          card_id?: string
          org_id?: string
          owner_id?: string
          phase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_phase_owners_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "card_phase_owners_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "card_phase_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_phase_owners_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
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
          ai_pause_config: Json | null
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
          first_response_at: string | null
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
          lead_entry_path: string | null
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
          quality_score_pct: number | null
          receita: number | null
          receita_source: string | null
          sdr_owner_id: string | null
          stage_changed_at: string | null
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
          ai_pause_config?: Json | null
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
          first_response_at?: string | null
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
          lead_entry_path?: string | null
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
          quality_score_pct?: number | null
          receita?: number | null
          receita_source?: string | null
          sdr_owner_id?: string | null
          stage_changed_at?: string | null
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
          ai_pause_config?: Json | null
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
          first_response_at?: string | null
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
          lead_entry_path?: string | null
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
          quality_score_pct?: number | null
          receita?: number | null
          receita_source?: string | null
          sdr_owner_id?: string | null
          stage_changed_at?: string | null
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
          org_id: string
          texto_explicativo: string | null
          updated_at: string | null
          updated_by: string | null
          valor_padrao: number | null
        }
        Insert: {
          ativo_global?: boolean | null
          id?: string
          org_id?: string
          texto_explicativo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_padrao?: number | null
        }
        Update: {
          ativo_global?: boolean | null
          id?: string
          org_id?: string
          texto_explicativo?: string | null
          updated_at?: string | null
          updated_by?: string | null
          valor_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_taxa_trips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_consolidation_audit: {
        Row: {
          batch: string
          error: string | null
          executed_at: string | null
          id: number
          loser_id: string | null
          loser_org_id_before: string | null
          loser_snapshot: Json | null
          match_reason: string | null
          meios_merged: number | null
          meios_skipped_dup: number | null
          operation: string
          planned_at: string | null
          refs_updated: Json | null
          winner_id: string
          winner_org_id_before: string | null
        }
        Insert: {
          batch?: string
          error?: string | null
          executed_at?: string | null
          id?: number
          loser_id?: string | null
          loser_org_id_before?: string | null
          loser_snapshot?: Json | null
          match_reason?: string | null
          meios_merged?: number | null
          meios_skipped_dup?: number | null
          operation: string
          planned_at?: string | null
          refs_updated?: Json | null
          winner_id: string
          winner_org_id_before?: string | null
        }
        Update: {
          batch?: string
          error?: string | null
          executed_at?: string | null
          id?: number
          loser_id?: string | null
          loser_org_id_before?: string | null
          loser_snapshot?: Json | null
          match_reason?: string | null
          meios_merged?: number | null
          meios_skipped_dup?: number | null
          operation?: string
          planned_at?: string | null
          refs_updated?: Json | null
          winner_id?: string
          winner_org_id_before?: string | null
        }
        Relationships: []
      }
      contact_stats: {
        Row: {
          contact_id: string
          is_group_leader: boolean | null
          last_trip_date: string | null
          next_trip_date: string | null
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "contact_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          monde_last_sync: string | null
          monde_person_id: string | null
          nome: string
          nome_locked_at: string | null
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
          monde_last_sync?: string | null
          monde_person_id?: string | null
          nome: string
          nome_locked_at?: string | null
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
          monde_last_sync?: string | null
          monde_person_id?: string | null
          nome?: string
          nome_locked_at?: string | null
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "contratos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "document_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          org_id: string | null
          provider: string | null
          provider_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_key: string | null
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string | null
          provider?: string | null
          provider_id?: string | null
          sent_at?: string | null
          status: string
          subject?: string | null
          template_key?: string | null
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string | null
          provider?: string | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notification_preferences: {
        Row: {
          created_at: string
          email_notifications_enabled: boolean
          id: string
          notification_types: Json
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_notifications_enabled?: boolean
          id?: string
          notification_types?: Json
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_notifications_enabled?: boolean
          id?: string
          notification_types?: Json
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "email_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          active: boolean | null
          body_html: string
          body_text: string | null
          created_at: string
          id: string
          org_id: string | null
          subject: string
          template_key: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          active?: boolean | null
          body_html: string
          body_text?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          subject: string
          template_key: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          active?: boolean | null
          body_html?: string
          body_text?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          subject?: string
          template_key?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "financial_item_passengers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "integration_conflict_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "integration_health_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "integration_outbound_field_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "integration_outbound_stage_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          id: string
          is_encrypted: boolean
          key: string
          org_id: string
          produto: string | null
          updated_at: string | null
          value: string
          value_encrypted: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          is_encrypted?: boolean
          key: string
          org_id?: string
          produto?: string | null
          updated_at?: string | null
          value: string
          value_encrypted?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          is_encrypted?: boolean
          key?: string
          org_id?: string
          produto?: string | null
          updated_at?: string | null
          value?: string
          value_encrypted?: string | null
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
          org_id: string
          outbound_enabled: boolean | null
          pipeline_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inbound_enabled?: boolean | null
          integration_id?: string | null
          org_id?: string
          outbound_enabled?: boolean | null
          pipeline_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inbound_enabled?: boolean | null
          integration_id?: string | null
          org_id?: string
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
            foreignKeyName: "integration_task_sync_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "integration_task_type_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          provider?: string
          transformer_rules?: Json
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string | null
          id: string
          movement_type: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
          performed_by?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "inventory_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      iterpec_bookings: {
        Row: {
          booking_id: string | null
          card_id: string | null
          created_at: string
          expires_at: string
          id: string
          iterpec_token: string
          org_id: string
          proposal_item_id: string | null
          search_criteria: Json
          service_type: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          card_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          iterpec_token: string
          org_id?: string
          proposal_item_id?: string | null
          search_criteria?: Json
          service_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          card_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          iterpec_token?: string
          org_id?: string
          proposal_item_id?: string | null
          search_criteria?: Json
          service_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_iterpec_bookings_proposal_item"
            columns: ["proposal_item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterpec_bookings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterpec_bookings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterpec_bookings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterpec_bookings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "iterpec_bookings_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterpec_bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagem_templates: {
        Row: {
          ativa: boolean | null
          categoria: string
          corpo: string | null
          corpo_fallback: string | null
          created_at: string | null
          created_by: string | null
          hsm_language: string | null
          hsm_namespace: string | null
          hsm_template_name: string | null
          ia_contexto_config: Json | null
          ia_prompt: string | null
          ia_restricoes: Json | null
          id: string
          is_hsm: boolean | null
          modo: string
          nome: string
          org_id: string
          produto: Database["public"]["Enums"]["app_product"] | null
          updated_at: string | null
          variaveis: Json | null
        }
        Insert: {
          ativa?: boolean | null
          categoria?: string
          corpo?: string | null
          corpo_fallback?: string | null
          created_at?: string | null
          created_by?: string | null
          hsm_language?: string | null
          hsm_namespace?: string | null
          hsm_template_name?: string | null
          ia_contexto_config?: Json | null
          ia_prompt?: string | null
          ia_restricoes?: Json | null
          id?: string
          is_hsm?: boolean | null
          modo?: string
          nome: string
          org_id?: string
          produto?: Database["public"]["Enums"]["app_product"] | null
          updated_at?: string | null
          variaveis?: Json | null
        }
        Update: {
          ativa?: boolean | null
          categoria?: string
          corpo?: string | null
          corpo_fallback?: string | null
          created_at?: string | null
          created_by?: string | null
          hsm_language?: string | null
          hsm_namespace?: string | null
          hsm_template_name?: string | null
          ia_contexto_config?: Json | null
          ia_prompt?: string | null
          ia_restricoes?: Json | null
          id?: string
          is_hsm?: boolean | null
          modo?: string
          nome?: string
          org_id?: string
          produto?: Database["public"]["Enums"]["app_product"] | null
          updated_at?: string | null
          variaveis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagem_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "mensagem_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "monde_import_log_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "monde_import_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monde_pending_sales: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          import_log_id: string | null
          matched_at: string | null
          matched_card_id: string | null
          org_id: string
          products: Json
          products_count: number
          status: string
          total_receita: number
          total_venda: number
          venda_num: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          import_log_id?: string | null
          matched_at?: string | null
          matched_card_id?: string | null
          org_id?: string
          products?: Json
          products_count?: number
          status?: string
          total_receita?: number
          total_venda?: number
          venda_num: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          import_log_id?: string | null
          matched_at?: string | null
          matched_card_id?: string | null
          org_id?: string
          products?: Json
          products_count?: number
          status?: string
          total_receita?: number
          total_venda?: number
          venda_num?: string
        }
        Relationships: [
          {
            foreignKeyName: "monde_pending_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "monde_pending_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "monde_import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_matched_card_id_fkey"
            columns: ["matched_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_matched_card_id_fkey"
            columns: ["matched_card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_matched_card_id_fkey"
            columns: ["matched_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_matched_card_id_fkey"
            columns: ["matched_card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "monde_pending_sales_matched_card_id_fkey"
            columns: ["matched_card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_pending_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monde_people_queue: {
        Row: {
          attempts: number | null
          changed_fields: string[] | null
          contato_id: string
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          org_id: string
          processed_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          changed_fields?: string[] | null
          contato_id: string
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          org_id?: string
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          changed_fields?: string[] | null
          contato_id?: string
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          org_id?: string
          processed_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monde_people_queue_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_people_queue_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "monde_people_queue_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monde_people_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "monde_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "n8n_ai_extraction_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
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
      org_members: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
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
          branding: Json | null
          business_hours: Json | null
          created_at: string
          force_relogin_after: string | null
          id: string
          logo_url: string | null
          name: string
          onboarding_completed_at: string | null
          onboarding_step: number
          parent_org_id: string | null
          settings: Json | null
          shares_contacts_with_children: boolean
          slug: string
          status: string
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          branding?: Json | null
          business_hours?: Json | null
          created_at?: string
          force_relogin_after?: string | null
          id?: string
          logo_url?: string | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          parent_org_id?: string | null
          settings?: Json | null
          shares_contacts_with_children?: boolean
          slug: string
          status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          branding?: Json | null
          business_hours?: Json | null
          created_at?: string
          force_relogin_after?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          parent_org_id?: string | null
          settings?: Json | null
          shares_contacts_with_children?: boolean
          slug?: string
          status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          accent_color: string | null
          active: boolean
          color: string
          created_at: string | null
          id: string
          is_entry_phase: boolean
          is_terminal_phase: boolean
          label: string
          name: string
          order_index: number
          org_id: string
          owner_field: string | null
          owner_label: string | null
          slug: string | null
          supports_win: boolean
          updated_at: string | null
          visible_in_card: boolean | null
          win_action: string | null
        }
        Insert: {
          accent_color?: string | null
          active?: boolean
          color: string
          created_at?: string | null
          id?: string
          is_entry_phase?: boolean
          is_terminal_phase?: boolean
          label: string
          name: string
          order_index?: number
          org_id?: string
          owner_field?: string | null
          owner_label?: string | null
          slug?: string | null
          supports_win?: boolean
          updated_at?: string | null
          visible_in_card?: boolean | null
          win_action?: string | null
        }
        Update: {
          accent_color?: string | null
          active?: boolean
          color?: string
          created_at?: string | null
          id?: string
          is_entry_phase?: boolean
          is_terminal_phase?: boolean
          label?: string
          name?: string
          order_index?: number
          org_id?: string
          owner_field?: string | null
          owner_label?: string | null
          slug?: string | null
          supports_win?: boolean
          updated_at?: string | null
          visible_in_card?: boolean | null
          win_action?: string | null
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
      platform_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          ip: unknown
          metadata: Json
          target_id: string | null
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json
          target_id?: string | null
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json
          target_id?: string | null
          target_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "platform_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "pos_venda_import_log_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "pos_venda_import_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          active_org_id: string | null
          avatar_url: string | null
          created_at: string | null
          department_id: string | null
          email: string | null
          id: string
          impersonating_org_id: string | null
          is_admin: boolean | null
          is_platform_admin: boolean
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
          active_org_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          id: string
          impersonating_org_id?: string | null
          is_admin?: boolean | null
          is_platform_admin?: boolean
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
          active_org_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          id?: string
          impersonating_org_id?: string | null
          is_admin?: boolean | null
          is_platform_admin?: boolean
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
            foreignKeyName: "profiles_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "profiles_impersonating_org_id_fkey"
            columns: ["impersonating_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "proposal_client_selections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          enrichment_last_sync: string | null
          external_id: string | null
          external_provider: string | null
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
          enrichment_last_sync?: string | null
          external_id?: string | null
          external_provider?: string | null
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
          enrichment_last_sync?: string | null
          external_id?: string | null
          external_provider?: string | null
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "proposal_options_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      proposal_trip_plans: {
        Row: {
          card_id: string
          checklist: Json
          contacts: Json
          created_at: string
          id: string
          org_id: string
          proposal_id: string | null
          public_token: string | null
          status: string
          timeline: Json
          updated_at: string
          vouchers: Json
        }
        Insert: {
          card_id: string
          checklist?: Json
          contacts?: Json
          created_at?: string
          id?: string
          org_id?: string
          proposal_id?: string | null
          public_token?: string | null
          status?: string
          timeline?: Json
          updated_at?: string
          vouchers?: Json
        }
        Update: {
          card_id?: string
          checklist?: Json
          contacts?: Json
          created_at?: string
          id?: string
          org_id?: string
          proposal_id?: string | null
          public_token?: string | null
          status?: string
          timeline?: Json
          updated_at?: string
          vouchers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "proposal_trip_plans_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["proposal_id"]
          },
          {
            foreignKeyName: "proposal_trip_plans_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "v_proposal_analytics"
            referencedColumns: ["id"]
          },
        ]
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
      provider_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          payload: Json
          provider: string
        }
        Insert: {
          cache_key: string
          expires_at: string
          fetched_at?: string
          payload: Json
          provider: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          payload?: Json
          provider?: string
        }
        Relationships: []
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
      reactivation_patterns: {
        Row: {
          avg_days_between_trips: number | null
          avg_trip_value: number | null
          birthday_date: string | null
          calculated_at: string | null
          companion_count: number | null
          companion_names: string[] | null
          contact_id: string
          days_since_interaction: number | null
          days_since_last_trip: number | null
          days_until_birthday: number | null
          days_until_ideal_contact: number | null
          gifts_sent_count: number | null
          has_sibling_open_card: boolean | null
          ideal_contact_date: string | null
          is_high_value: boolean | null
          is_referrer: boolean | null
          last_destinations: string[] | null
          last_gift_date: string | null
          last_interaction_date: string | null
          last_interaction_type: string | null
          last_lost_reason_id: string | null
          last_lost_reason_name: string | null
          last_responsavel_id: string | null
          org_id: string
          peak_months: number[] | null
          peak_months_confidence: number | null
          predicted_next_trip_end: string | null
          predicted_next_trip_start: string | null
          prediction_confidence: number | null
          preferred_duration_days: number | null
          reactivation_score: number | null
          recent_interaction_warning: boolean | null
          referral_count: number | null
          score_breakdown: Json | null
          total_completed_trips: number | null
          total_revenue: number | null
          travel_frequency_per_year: number | null
          typical_booking_lead_days: number | null
        }
        Insert: {
          avg_days_between_trips?: number | null
          avg_trip_value?: number | null
          birthday_date?: string | null
          calculated_at?: string | null
          companion_count?: number | null
          companion_names?: string[] | null
          contact_id: string
          days_since_interaction?: number | null
          days_since_last_trip?: number | null
          days_until_birthday?: number | null
          days_until_ideal_contact?: number | null
          gifts_sent_count?: number | null
          has_sibling_open_card?: boolean | null
          ideal_contact_date?: string | null
          is_high_value?: boolean | null
          is_referrer?: boolean | null
          last_destinations?: string[] | null
          last_gift_date?: string | null
          last_interaction_date?: string | null
          last_interaction_type?: string | null
          last_lost_reason_id?: string | null
          last_lost_reason_name?: string | null
          last_responsavel_id?: string | null
          org_id?: string
          peak_months?: number[] | null
          peak_months_confidence?: number | null
          predicted_next_trip_end?: string | null
          predicted_next_trip_start?: string | null
          prediction_confidence?: number | null
          preferred_duration_days?: number | null
          reactivation_score?: number | null
          recent_interaction_warning?: boolean | null
          referral_count?: number | null
          score_breakdown?: Json | null
          total_completed_trips?: number | null
          total_revenue?: number | null
          travel_frequency_per_year?: number | null
          typical_booking_lead_days?: number | null
        }
        Update: {
          avg_days_between_trips?: number | null
          avg_trip_value?: number | null
          birthday_date?: string | null
          calculated_at?: string | null
          companion_count?: number | null
          companion_names?: string[] | null
          contact_id?: string
          days_since_interaction?: number | null
          days_since_last_trip?: number | null
          days_until_birthday?: number | null
          days_until_ideal_contact?: number | null
          gifts_sent_count?: number | null
          has_sibling_open_card?: boolean | null
          ideal_contact_date?: string | null
          is_high_value?: boolean | null
          is_referrer?: boolean | null
          last_destinations?: string[] | null
          last_gift_date?: string | null
          last_interaction_date?: string | null
          last_interaction_type?: string | null
          last_lost_reason_id?: string | null
          last_lost_reason_name?: string | null
          last_responsavel_id?: string | null
          org_id?: string
          peak_months?: number[] | null
          peak_months_confidence?: number | null
          predicted_next_trip_end?: string | null
          predicted_next_trip_start?: string | null
          prediction_confidence?: number | null
          preferred_duration_days?: number | null
          reactivation_score?: number | null
          recent_interaction_warning?: boolean | null
          referral_count?: number | null
          score_breakdown?: Json | null
          total_completed_trips?: number | null
          total_revenue?: number | null
          travel_frequency_per_year?: number | null
          typical_booking_lead_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_patterns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_patterns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "reactivation_patterns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_patterns_last_lost_reason_id_fkey"
            columns: ["last_lost_reason_id"]
            isOneToOne: false
            referencedRelation: "motivos_perda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_patterns_last_responsavel_id_fkey"
            columns: ["last_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_patterns_last_responsavel_id_fkey"
            columns: ["last_responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "reactivation_patterns_last_responsavel_id_fkey"
            columns: ["last_responsavel_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reactivation_suppressions: {
        Row: {
          contact_id: string
          created_at: string | null
          created_by: string | null
          id: string
          note: string | null
          org_id: string
          reason: string
          suppressed_until: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          reason: string
          suppressed_until?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          reason?: string
          suppressed_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_suppressions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_suppressions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contact_proposals"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "reactivation_suppressions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "view_deleted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_suppressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_suppressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "reactivation_suppressions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_suppressions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      scheduled_job_kill_switch: {
        Row: {
          category: string
          created_at: string
          description: string | null
          frequency_label: string | null
          impact_tags: string[] | null
          is_enabled: boolean
          job_name: string
          label: string
          last_toggled_at: string | null
          last_toggled_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          frequency_label?: string | null
          impact_tags?: string[] | null
          is_enabled?: boolean
          job_name: string
          label: string
          last_toggled_at?: string | null
          last_toggled_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          frequency_label?: string | null
          impact_tags?: string[] | null
          is_enabled?: boolean
          job_name?: string
          label?: string
          last_toggled_at?: string | null
          last_toggled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_job_kill_switch_last_toggled_by_fkey"
            columns: ["last_toggled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_job_kill_switch_last_toggled_by_fkey"
            columns: ["last_toggled_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "scheduled_job_kill_switch_last_toggled_by_fkey"
            columns: ["last_toggled_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
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
            columns: ["field_key", "org_id"]
            isOneToOne: false
            referencedRelation: "system_fields"
            referencedColumns: ["key", "org_id"]
          },
          {
            foreignKeyName: "section_field_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          required_team_role: string | null
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
          required_team_role?: string | null
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
          required_team_role?: string | null
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
      stage_field_confirmations: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          field_key: string
          field_label: string | null
          id: string
          ordem: number
          org_id: string
          stage_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          field_key: string
          field_label?: string | null
          id?: string
          ordem?: number
          org_id?: string
          stage_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          field_key?: string
          field_label?: string | null
          id?: string
          ordem?: number
          org_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_field_confirmations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_field_confirmations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_field_confirmations_stage_id_fkey"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          required?: boolean | null
          stage_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_fields_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      stage_win_probability: {
        Row: {
          created_at: string
          id: string
          org_id: string
          pipeline_id: string
          probability: number
          stage_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string
          pipeline_id: string
          probability: number
          stage_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          pipeline_id?: string
          probability?: number
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_win_probability_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_win_probability_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_win_probability_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_win_probability_stage_id_fkey"
            columns: ["stage_id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "sub_card_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          produto_exclusivo: string | null
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
          produto_exclusivo?: string | null
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
          produto_exclusivo?: string | null
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
          org_id: string
          role: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      terms_acceptance: {
        Row: {
          accepted_at: string
          context: string
          created_at: string
          dpa_version: string | null
          id: string
          ip_address: unknown
          org_id: string | null
          privacy_version: string
          terms_version: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string
          context?: string
          created_at?: string
          dpa_version?: string | null
          id?: string
          ip_address?: unknown
          org_id?: string | null
          privacy_version: string
          terms_version: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string
          context?: string
          created_at?: string
          dpa_version?: string | null
          id?: string
          ip_address?: unknown
          org_id?: string | null
          privacy_version?: string
          terms_version?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terms_acceptance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "terms_acceptance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
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
      trip_checklist_progress: {
        Row: {
          checked_at: string
          id: string
          item_key: string
          org_id: string
          participant_id: string
          viagem_id: string
        }
        Insert: {
          checked_at?: string
          id?: string
          item_key: string
          org_id: string
          participant_id: string
          viagem_id: string
        }
        Update: {
          checked_at?: string
          id?: string
          item_key?: string
          org_id?: string
          participant_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_checklist_progress_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_checklist_progress_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "trip_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_checklist_progress_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_comments: {
        Row: {
          autor: string
          autor_id: string | null
          created_at: string
          id: string
          interno: boolean
          item_id: string | null
          org_id: string
          texto: string
          viagem_id: string
        }
        Insert: {
          autor: string
          autor_id?: string | null
          created_at?: string
          id?: string
          interno?: boolean
          item_id?: string | null
          org_id?: string
          texto: string
          viagem_id: string
        }
        Update: {
          autor?: string
          autor_id?: string | null
          created_at?: string
          id?: string
          interno?: boolean
          item_id?: string | null
          org_id?: string
          texto?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "trip_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_comments_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_events: {
        Row: {
          created_at: string
          id: string
          org_id: string
          payload: Json
          tipo: string
          viagem_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string
          payload?: Json
          tipo: string
          viagem_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          payload?: Json
          tipo?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_events_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_item_history: {
        Row: {
          autor: string | null
          campo: string
          created_at: string
          id: string
          item_id: string
          org_id: string
          papel: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
          viagem_id: string
        }
        Insert: {
          autor?: string | null
          campo: string
          created_at?: string
          id?: string
          item_id: string
          org_id?: string
          papel?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
          viagem_id: string
        }
        Update: {
          autor?: string | null
          campo?: string
          created_at?: string
          id?: string
          item_id?: string
          org_id?: string
          papel?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_item_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "trip_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_items: {
        Row: {
          alternativas: Json
          aprovado_em: string | null
          aprovado_por: string | null
          comercial: Json
          created_at: string
          criado_por: string | null
          criado_por_papel: string | null
          deleted_at: string | null
          editado_por: string | null
          editado_por_papel: string | null
          id: string
          operacional: Json
          ordem: number
          org_id: string
          parent_id: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["trip_item_status"]
          tipo: Database["public"]["Enums"]["trip_item_tipo"]
          updated_at: string
          viagem_id: string
        }
        Insert: {
          alternativas?: Json
          aprovado_em?: string | null
          aprovado_por?: string | null
          comercial?: Json
          created_at?: string
          criado_por?: string | null
          criado_por_papel?: string | null
          deleted_at?: string | null
          editado_por?: string | null
          editado_por_papel?: string | null
          id?: string
          operacional?: Json
          ordem?: number
          org_id?: string
          parent_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["trip_item_status"]
          tipo: Database["public"]["Enums"]["trip_item_tipo"]
          updated_at?: string
          viagem_id: string
        }
        Update: {
          alternativas?: Json
          aprovado_em?: string | null
          aprovado_por?: string | null
          comercial?: Json
          created_at?: string
          criado_por?: string | null
          criado_por_papel?: string | null
          deleted_at?: string | null
          editado_por?: string | null
          editado_por_papel?: string | null
          id?: string
          operacional?: Json
          ordem?: number
          org_id?: string
          parent_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["trip_item_status"]
          tipo?: Database["public"]["Enums"]["trip_item_tipo"]
          updated_at?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "trip_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_items_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_library_items: {
        Row: {
          comercial: Json
          created_at: string
          criado_por: string | null
          id: string
          is_shared: boolean
          operacional: Json
          org_id: string
          tipo: Database["public"]["Enums"]["trip_item_tipo"]
          titulo: string
          updated_at: string
          uso_count: number
        }
        Insert: {
          comercial?: Json
          created_at?: string
          criado_por?: string | null
          id?: string
          is_shared?: boolean
          operacional?: Json
          org_id?: string
          tipo: Database["public"]["Enums"]["trip_item_tipo"]
          titulo: string
          updated_at?: string
          uso_count?: number
        }
        Update: {
          comercial?: Json
          created_at?: string
          criado_por?: string | null
          id?: string
          is_shared?: boolean
          operacional?: Json
          org_id?: string
          tipo?: Database["public"]["Enums"]["trip_item_tipo"]
          titulo?: string
          updated_at?: string
          uso_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_library_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_participants: {
        Row: {
          created_at: string
          email: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          nome: string
          org_id: string
          relacao: string | null
          telefone: string | null
          viagem_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          nome: string
          org_id: string
          relacao?: string | null
          telefone?: string | null
          viagem_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          nome?: string
          org_id?: string
          relacao?: string | null
          telefone?: string | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_photos: {
        Row: {
          caption: string | null
          created_at: string
          file_url: string
          height: number | null
          id: string
          org_id: string
          participant_id: string | null
          viagem_id: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_url: string
          height?: number | null
          id?: string
          org_id: string
          participant_id?: string | null
          viagem_id: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_url?: string
          height?: number | null
          id?: string
          org_id?: string
          participant_id?: string | null
          viagem_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_photos_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "trip_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_photos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plan_approvals: {
        Row: {
          approval_data: Json
          block_id: string | null
          client_notes: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          org_id: string
          resolved_at: string | null
          status: string
          title: string
          trip_plan_id: string
        }
        Insert: {
          approval_data?: Json
          block_id?: string | null
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          org_id?: string
          resolved_at?: string | null
          status?: string
          title: string
          trip_plan_id: string
        }
        Update: {
          approval_data?: Json
          block_id?: string | null
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          org_id?: string
          resolved_at?: string | null
          status?: string
          title?: string
          trip_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_plan_approvals_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "trip_plan_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "trip_plan_approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_approvals_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "proposal_trip_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plan_blocks: {
        Row: {
          block_type: string
          created_at: string
          data: Json
          id: string
          is_published: boolean
          ordem: number
          org_id: string
          parent_day_id: string | null
          published_at: string | null
          trip_plan_id: string
          updated_at: string
        }
        Insert: {
          block_type: string
          created_at?: string
          data?: Json
          id?: string
          is_published?: boolean
          ordem?: number
          org_id?: string
          parent_day_id?: string | null
          published_at?: string | null
          trip_plan_id: string
          updated_at?: string
        }
        Update: {
          block_type?: string
          created_at?: string
          data?: Json
          id?: string
          is_published?: boolean
          ordem?: number
          org_id?: string
          parent_day_id?: string | null
          published_at?: string | null
          trip_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_plan_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_blocks_parent_day_id_fkey"
            columns: ["parent_day_id"]
            isOneToOne: false
            referencedRelation: "trip_plan_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_blocks_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "proposal_trip_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      viagens: {
        Row: {
          capa_url: string | null
          card_id: string | null
          confirmada_em: string | null
          created_at: string
          enviada_em: string | null
          estado: Database["public"]["Enums"]["viagem_estado"]
          id: string
          nps_comentario: string | null
          nps_nota: number | null
          nps_respondida_em: string | null
          org_id: string
          pos_owner_id: string | null
          public_token: string
          subtitulo: string | null
          titulo: string | null
          total_aprovado: number
          total_estimado: number
          tp_owner_id: string | null
          updated_at: string
        }
        Insert: {
          capa_url?: string | null
          card_id?: string | null
          confirmada_em?: string | null
          created_at?: string
          enviada_em?: string | null
          estado?: Database["public"]["Enums"]["viagem_estado"]
          id?: string
          nps_comentario?: string | null
          nps_nota?: number | null
          nps_respondida_em?: string | null
          org_id?: string
          pos_owner_id?: string | null
          public_token?: string
          subtitulo?: string | null
          titulo?: string | null
          total_aprovado?: number
          total_estimado?: number
          tp_owner_id?: string | null
          updated_at?: string
        }
        Update: {
          capa_url?: string | null
          card_id?: string | null
          confirmada_em?: string | null
          created_at?: string
          enviada_em?: string | null
          estado?: Database["public"]["Enums"]["viagem_estado"]
          id?: string
          nps_comentario?: string | null
          nps_nota?: number | null
          nps_respondida_em?: string | null
          org_id?: string
          pos_owner_id?: string | null
          public_token?: string
          subtitulo?: string | null
          titulo?: string | null
          total_aprovado?: number
          total_estimado?: number
          tp_owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_archived_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_cards_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_cards_contatos_summary"
            referencedColumns: ["card_id"]
          },
          {
            foreignKeyName: "viagens_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "view_deleted_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_pos_owner_id_fkey"
            columns: ["pos_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_pos_owner_id_fkey"
            columns: ["pos_owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "viagens_pos_owner_id_fkey"
            columns: ["pos_owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_tp_owner_id_fkey"
            columns: ["tp_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_tp_owner_id_fkey"
            columns: ["tp_owner_id"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "viagens_tp_owner_id_fkey"
            columns: ["tp_owner_id"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_extractions: {
        Row: {
          confidence: number | null
          confirmed_by: string | null
          created_at: string
          extracted_data: Json | null
          extraction_error: string | null
          file_name: string
          file_url: string
          id: string
          operator_confirmed: boolean
          org_id: string
          trip_plan_id: string
          voucher_type: string | null
        }
        Insert: {
          confidence?: number | null
          confirmed_by?: string | null
          created_at?: string
          extracted_data?: Json | null
          extraction_error?: string | null
          file_name: string
          file_url: string
          id?: string
          operator_confirmed?: boolean
          org_id?: string
          trip_plan_id: string
          voucher_type?: string | null
        }
        Update: {
          confidence?: number | null
          confirmed_by?: string | null
          created_at?: string
          extracted_data?: Json | null
          extraction_error?: string | null
          file_name?: string
          file_url?: string
          id?: string
          operator_confirmed?: boolean
          org_id?: string
          trip_plan_id?: string
          voucher_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_extractions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_extractions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_team_proposal_performance"
            referencedColumns: ["consultant_id"]
          },
          {
            foreignKeyName: "voucher_extractions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "view_profiles_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_extractions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_extractions_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "proposal_trip_plans"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          platform_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_custom_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          platform_id?: string | null
          transform_config?: Json | null
          transform_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_field_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          id: string
          org_id: string
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
          id?: string
          org_id?: string
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
          id?: string
          org_id?: string
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
            foreignKeyName: "whatsapp_linha_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          phase_id: string | null
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
          phase_id?: string | null
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
          phase_id?: string | null
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
            foreignKeyName: "whatsapp_messages_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "pipeline_phases"
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
          org_id: string
          phase_id: string | null
          platform_id: string | null
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          phase_id?: string | null
          platform_id?: string | null
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          phase_id?: string | null
          platform_id?: string | null
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_phase_instance_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          provider?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_platforms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
      ai_agent_health_stats: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_turns_24h: number | null
          agent_turns_7d: number | null
          ativa: boolean | null
          conversations_24h: number | null
          escalated_24h: number | null
          input_tokens_24h: number | null
          input_tokens_7d: number | null
          org_id: string | null
          output_tokens_24h: number | null
          output_tokens_7d: number | null
          tool_calls_24h: number | null
          tool_failures_24h: number | null
          tool_success_rate_pct: number | null
          user_turns_24h: number | null
          user_turns_7d: number | null
          whatsapp_blocked_test_24h: number | null
          whatsapp_failed_24h: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_recent_errors: {
        Row: {
          agent_id: string | null
          created_at: string | null
          details: Json | null
          error_message: string | null
          error_source: string | null
          rn: number | null
        }
        Relationships: []
      }
      ai_agent_v1_v2_comparison: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_version: string | null
          avg_qual_score: number | null
          avg_tokens_per_response: number | null
          conversations: number | null
          escalated_conversations: number | null
          escalation_rate: number | null
          first_turn_at: string | null
          last_turn_at: string | null
          org_id: string | null
          responses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          phase_slug: string | null
          pipeline_id: string | null
          pipeline_nome: string | null
          pipeline_stage_id: string | null
          pos_owner_id: string | null
          pos_owner_nome: string | null
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
      _a_ctx_owner_ok: {
        Args: {
          arr_ids: string[]
          ctx: string
          dono_id: string
          pos_id: string
          sdr_id: string
          single_id: string
          vendas_id: string
        }
        Returns: boolean
      }
      _a_destino_ok: {
        Args: { arr_destinos: string[]; produto_data: Json }
        Returns: boolean
      }
      _a_entry_path_ok: {
        Args: { actual: string; wanted: string }
        Returns: boolean
      }
      _a_origem_ok: {
        Args: { actual: string; arr_origens: string[] }
        Returns: boolean
      }
      _a_owner_ok: {
        Args: { actual_id: string; arr_ids: string[]; single_id: string }
        Returns: boolean
      }
      _a_phase_ok: {
        Args: { arr_phase_slugs: string[]; stage_id: string }
        Returns: boolean
      }
      _a_tag_ok: {
        Args: { card_id: string; tag_ids: string[] }
        Returns: boolean
      }
      _audit_org_id_risky_triggers: {
        Args: never
        Returns: {
          function_name: string
          insert_has_org_id: boolean
          is_security_definer: boolean
          table_has_before_trigger: boolean
          target_table: string
        }[]
      }
      _consolidate_merge_one: { Args: { p_audit_id: number }; Returns: Json }
      _consolidate_move_one: {
        Args: { p_audit_id: number }
        Returns: undefined
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
      accept_invite_for_existing_user: {
        Args: { p_token: string }
        Returns: Json
      }
      agent_assign_tag: {
        Args: { p_card_id: string; p_tag_color?: string; p_tag_name: string }
        Returns: Json
      }
      agent_check_calendar: {
        Args: { p_date_from?: string; p_date_to?: string; p_owner_id: string }
        Returns: Json
      }
      agent_request_handoff: {
        Args: {
          p_card_id: string
          p_context_summary?: string
          p_reason?: string
        }
        Returns: Json
      }
      agent_update_card_data: {
        Args: {
          p_allowed_fields?: string[]
          p_card_id: string
          p_patch: Json
          p_protected_fields?: string[]
        }
        Returns: Json
      }
      aggregate_ai_agent_metrics: {
        Args: { p_agent_id: string; p_date?: string }
        Returns: undefined
      }
      analytics_bottleneck_by_item: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_origem?: string[]
          p_owner_id?: string
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_cadence_compliance: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_carteira_aberta_planner: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_completed_trips: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_origem?: string[]
          p_owner_id?: string
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_conversion_by_ticket: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_customer_retention:
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_lead_entry_path?: string
              p_origem?: string[]
              p_owner_id?: string
              p_owner_ids?: string[]
              p_phase_slugs?: string[]
              p_product?: string
              p_tag_ids?: string[]
              p_to?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_lead_entry_path?: string
              p_origem?: string[]
              p_owner_id?: string
              p_phase_slugs?: string[]
              p_product?: string
              p_to?: string
            }
            Returns: Json
          }
      analytics_drill_down_cards: {
        Args: {
          p_date_end?: string
          p_date_ref?: string
          p_date_start?: string
          p_drill_destino?: string
          p_drill_ganho_fase?: string
          p_drill_loss_reason?: string
          p_drill_owner_id?: string
          p_drill_period_end?: string
          p_drill_period_start?: string
          p_drill_phase?: string
          p_drill_root_stage_id?: string
          p_drill_source?: string
          p_drill_stage_id?: string
          p_drill_status?: string
          p_drill_status_array?: string[]
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
      analytics_dropped_balls: {
        Args: {
          p_limit?: number
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_threshold_business_minutes?: number
        }
        Returns: Json
      }
      analytics_explorer_query: {
        Args: {
          p_cross_with?: string
          p_filters?: Json
          p_from?: string
          p_group_by: string
          p_limit?: number
          p_measure: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_explorer_schema: { Args: never; Returns: Json }
      analytics_field_completeness: {
        Args: {
          p_ctx?: string
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
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
      analytics_forecast_ponderado: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
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
          receita_total: number
          stage_id: string
          stage_nome: string
          total_valor: number
        }[]
      }
      analytics_funnel_conversion_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_mode?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
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
          receita_total: number
          stage_id: string
          stage_nome: string
          total_valor: number
        }[]
      }
      analytics_funnel_conversion_v3: {
        Args: {
          p_date_end?: string
          p_date_ref?: string
          p_date_start?: string
          p_ganho_fase?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_product?: string
          p_stage_id?: string
          p_status?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          current_count: number
          ordem: number
          p50_days_in_stage: number
          p75_days_in_stage: number
          period_count: number
          period_receita: number
          period_valor: number
          phase_slug: string
          stage_id: string
          stage_nome: string
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
      analytics_funnel_live_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_mode?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
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
      analytics_funnel_velocity: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_owner_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          cards_atuais: number
          cards_passaram: number
          media_dias: number
          mediana_dias: number
          ordem: number
          p90_dias: number
          phase_slug: string
          stage_id: string
          stage_nome: string
        }[]
      }
      analytics_funnel_velocity_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          cards_atuais: number
          cards_passaram: number
          media_dias: number
          mediana_dias: number
          ordem: number
          p90_dias: number
          phase_slug: string
          stage_id: string
          stage_nome: string
        }[]
      }
      analytics_funnel_velocity_v3: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_owner_ids?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          cards_atuais: number
          cards_passaram: number
          media_dias: number
          mediana_dias: number
          ordem: number
          p90_dias: number
          phase_slug: string
          stage_id: string
          stage_nome: string
        }[]
      }
      analytics_handoff_speed: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_origem?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_lead_entry_path_breakdown: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
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
      analytics_loss_reasons_by_planner: {
        Args: { p_from?: string; p_product?: string; p_to?: string }
        Returns: Json
      }
      analytics_loss_reasons_v2:
        | {
            Args: {
              p_date_end?: string
              p_date_start?: string
              p_destinos?: string[]
              p_lead_entry_path?: string
              p_mode?: string
              p_origem?: string[]
              p_owner_context?: string
              p_owner_id?: string
              p_owner_ids?: string[]
              p_phase_slugs?: string[]
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
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_lead_entry_path?: string
              p_limit?: number
              p_origem?: string[]
              p_owner_id?: string
              p_phase_slugs?: string[]
              p_product?: string
              p_to?: string
            }
            Returns: Json
          }
      analytics_motivos_perda_planner: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
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
      analytics_overdue_tasks_by_owner: {
        Args: { p_product?: string }
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
      analytics_overview_kpis_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_mode?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
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
      analytics_pipeline_current_v2: {
        Args: {
          p_date_ref?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
          p_value_max?: number
          p_value_min?: number
        }
        Returns: Json
      }
      analytics_planner_open_portfolio: {
        Args: { p_from?: string; p_product?: string; p_to?: string }
        Returns: Json
      }
      analytics_post_issues: {
        Args: {
          p_from?: string
          p_owner_id?: string
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_problemas_no_pos: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_proposal_to_win_velocity: {
        Args: { p_from?: string; p_product?: string; p_to?: string }
        Returns: Json
      }
      analytics_proposal_versions: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_origem?: string[]
          p_owner_id?: string
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_quality_score_global:
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_lead_entry_path?: string
              p_origem?: string[]
              p_owner_id?: string
              p_phase_slugs?: string[]
              p_product?: string
              p_to?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_date_end?: string
              p_date_start?: string
              p_owner_id?: string
              p_product?: string
            }
            Returns: Json
          }
      analytics_quality_score_v2: {
        Args: {
          p_ctx?: string
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_referrals_post_trip: {
        Args: { p_from?: string; p_product?: string; p_to?: string }
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
      analytics_retention_cohort_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_phase_slugs?: string[]
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
      analytics_retention_kpis_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      analytics_retorno_pos_viagem: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_return_customers: {
        Args: { p_from?: string; p_product?: string; p_to?: string }
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
      analytics_revenue_mom_yoy:
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_lead_entry_path?: string
              p_origem?: string[]
              p_owner_id?: string
              p_phase_slugs?: string[]
              p_product?: string
              p_to?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_date_end?: string
              p_date_start?: string
              p_owner_id?: string
              p_product?: string
            }
            Returns: Json
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
      analytics_revenue_timeseries_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_granularity?: string
          p_lead_entry_path?: string
          p_mode?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
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
      analytics_rework_rate: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_risk_concentration: {
        Args: {
          p_from?: string
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_saude_list: {
        Args: {
          p_bucket: string
          p_limit?: number
          p_offset?: number
          p_owner_ids?: string[]
          p_sort_by?: string
          p_tag_ids?: string[]
        }
        Returns: {
          card_id: string
          dias_parado: number
          dono_atual_id: string
          dono_atual_nome: string
          horas_sla_excedidas: number
          pessoa_nome: string
          phase_slug: string
          sla_hours: number
          stage_entered_at: string
          stage_id: string
          stage_nome: string
          titulo: string
          total_count: number
          updated_at: string
          valor_display: number
        }[]
      }
      analytics_saude_summary: {
        Args: { p_owner_ids?: string[]; p_tag_ids?: string[] }
        Returns: {
          sem_atividade_14d: number
          sem_atividade_30d: number
          sem_atividade_7d: number
          sem_briefing: number
          sem_contato: number
          sem_dono: number
          sla_violado: number
          tarefas_vencidas: number
          total_abertos: number
        }[]
      }
      analytics_saude_tarefas_vencidas: {
        Args: { p_limit?: number; p_offset?: number; p_owner_ids?: string[] }
        Returns: {
          card_id: string
          card_titulo: string
          data_vencimento: string
          dias_vencida: number
          prioridade: string
          responsavel_id: string
          responsavel_nome: string
          tarefa_id: string
          tipo: string
          titulo: string
          total_count: number
        }[]
      }
      analytics_sdr_avg_ticket: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          avg_ticket: number
          by_sdr: Json
          total_revenue: number
          total_sold_cards: number
        }[]
      }
      analytics_sdr_follow_through: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          by_sdr: Json
          follow_through_pct: number
          handoffs_won: number
          total_handoffs: number
        }[]
      }
      analytics_sdr_leads_by_source: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          sources: Json
          total_leads: number
        }[]
      }
      analytics_sdr_meetings: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          by_sdr: Json
          completion_rate_pct: number
          meetings_completed: number
          meetings_no_show: number
          meetings_scheduled: number
          no_show_rate_pct: number
        }[]
      }
      analytics_sdr_sla_compliance_pct: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_tag_ids?: string[]
        }
        Returns: {
          buckets: Json
          over_5h_pct: number
          total_messages: number
          under_1h_pct: number
          under_5h_pct: number
          under_5min_pct: number
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
      analytics_stage_conversion: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_stage_velocity_percentiles: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_tarefas_vencidas_time: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_task_completion_by_person: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_team_leaderboard: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_owner_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          cards_abertos: number
          cards_envolvidos: number
          cards_ganhos: number
          cards_perdidos: number
          fases: string[]
          receita_total: number
          tarefas_abertas: number
          tarefas_vencidas: number
          ticket_medio: number
          user_avatar_url: string
          user_id: string
          user_nome: string
          win_rate: number
        }[]
      }
      analytics_team_leaderboard_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          cards_abertos: number
          cards_envolvidos: number
          cards_ganhos: number
          cards_perdidos: number
          fases: string[]
          receita_total: number
          tarefas_abertas: number
          tarefas_vencidas: number
          ticket_medio: number
          user_avatar_url: string
          user_id: string
          user_nome: string
          win_rate: number
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
      analytics_team_performance_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_mode?: string
          p_origem?: string[]
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase?: string
          p_phase_slugs?: string[]
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
      analytics_team_sla_compliance: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_owner_ids?: string[]
        }
        Returns: {
          compliance_rate: number
          sla_cumpridas: number
          sla_violadas: number
          tempo_medio_horas: number
          total_transicoes: number
          user_id: string
          user_nome: string
        }[]
      }
      analytics_team_sla_compliance_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
        }
        Returns: {
          compliance_rate: number
          sla_cumpridas: number
          sla_violadas: number
          tempo_medio_horas: number
          total_transicoes: number
          user_id: string
          user_nome: string
        }[]
      }
      analytics_tempo_proposta_ganho: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
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
      analytics_top_destinations_v2: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_destinos?: string[]
          p_lead_entry_path?: string
          p_limit?: number
          p_mode?: string
          p_origem?: string[]
          p_owner_context?: string
          p_owner_id?: string
          p_owner_ids?: string[]
          p_phase_slugs?: string[]
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
      analytics_top_referrers:
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_limit?: number
              p_origem?: string[]
              p_owner_ids?: string[]
              p_phase_slugs?: string[]
              p_product?: string
              p_to?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_destinos?: string[]
              p_from?: string
              p_limit?: number
              p_origem?: string[]
              p_phase_slugs?: string[]
              p_product?: string
              p_to?: string
            }
            Returns: Json
          }
      analytics_trip_readiness: {
        Args: {
          p_destinos?: string[]
          p_max_days_ahead?: number
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
        }
        Returns: Json
      }
      analytics_trip_states: {
        Args: {
          p_from?: string
          p_owner_id?: string
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_trip_time_to_ready: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_origem?: string[]
          p_owner_id?: string
          p_product?: string
          p_to?: string
        }
        Returns: Json
      }
      analytics_upcoming_departures: {
        Args: {
          p_destinos?: string[]
          p_origem?: string[]
          p_owner_id?: string
          p_product?: string
        }
        Returns: Json
      }
      analytics_viagens_estado: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
          p_to?: string
        }
        Returns: Json
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
      analytics_whatsapp_speed_v2: {
        Args: {
          p_destinos?: string[]
          p_from?: string
          p_lead_entry_path?: string
          p_origem?: string[]
          p_owner_id?: string
          p_phase_slugs?: string[]
          p_product?: string
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
      apply_ai_conversation_extraction: {
        Args: {
          p_briefing_inicial?: Json
          p_card_id: string
          p_contact_fields?: Json
          p_produto_data?: Json
          p_viajantes?: Json
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
      aprovar_item: {
        Args: { p_item_id: string; p_token: string }
        Returns: Json
      }
      atrelar_viagem_a_card: {
        Args: { p_card_id: string; p_hidratar?: boolean; p_viagem_id: string }
        Returns: Json
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
      cadence_triggers_cross_org_count: { Args: never; Returns: number }
      calculate_agent_qualification_score: {
        Args: { p_agent_id: string; p_inputs: Json }
        Returns: Json
      }
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
      calculate_reactivation_patterns: { Args: never; Returns: number }
      can_manage_gifts: { Args: never; Returns: boolean }
      cancelar_sub_card: {
        Args: { p_motivo?: string; p_sub_card_id: string }
        Returns: Json
      }
      cards_sem_contato_whatsapp: {
        Args: { p_cutoff: string; p_limit?: number; p_produto: string }
        Returns: {
          card_id: string
          org_id: string
          pessoa_principal_id: string
        }[]
      }
      check_auth_rate_limit: { Args: { p_email: string }; Returns: Json }
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
      cleanup_message_buffer: {
        Args: { p_older_than_hours?: number }
        Returns: number
      }
      cleanup_net_http_response: { Args: never; Returns: undefined }
      comentar_item:
        | {
            Args: { p_item_id: string; p_texto: string; p_token: string }
            Returns: Json
          }
        | {
            Args: {
              p_item_id: string
              p_participant_id?: string
              p_texto: string
              p_token: string
            }
            Returns: Json
          }
      compartilhar_foto: {
        Args: {
          p_caption?: string
          p_file_url: string
          p_height?: number
          p_participant_id: string
          p_token: string
          p_width?: number
        }
        Returns: Json
      }
      completar_sub_card: { Args: { p_sub_card_id: string }; Returns: Json }
      complete_outbound_queue_item: {
        Args: { p_error?: string; p_queue_id: string; p_status: string }
        Returns: undefined
      }
      confirmar_viagem: { Args: { p_token: string }; Returns: Json }
      consolidate_contacts_execute: {
        Args: { p_batch?: string; p_limit?: number }
        Returns: Json
      }
      consolidate_contacts_plan: {
        Args: { p_batch?: string; p_parent_org?: string }
        Returns: Json
      }
      contatos_aniversario_hoje: {
        Args: {
          p_day: number
          p_limit?: number
          p_month: number
          p_produto: string
        }
        Returns: {
          card_id: string
          contato_id: string
          org_id: string
        }[]
      }
      contatos_default_org_id: { Args: never; Returns: string }
      converter_sub_card_em_principal: {
        Args: { p_sub_card_id: string }
        Returns: Json
      }
      create_user_and_card: {
        Args: { p_name: string; p_phone: string; p_pipeline_stage_id?: string }
        Returns: Json
      }
      criar_card_de_conversa_echo: {
        Args: {
          p_agent_email?: string
          p_conversation_id: string
          p_force_create?: boolean
          p_name: string
          p_phone: string
          p_phone_number_id?: string
          p_phone_number_label?: string
        }
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
      criar_viagem: {
        Args: {
          p_card_id?: string
          p_hidratar?: boolean
          p_subtitulo?: string
          p_titulo?: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_analytics_view: { Args: { p_id: string }; Returns: boolean }
      delete_user: { Args: { user_id: string }; Returns: undefined }
      describe_table: {
        Args: { p_table: string }
        Returns: {
          column_name: string
          data_type: string
          is_nullable: string
        }[]
      }
      dispatch_automacao_mensagem_processor: { Args: never; Returns: undefined }
      dispatch_automacao_trigger_temporal: { Args: never; Returns: undefined }
      dispatch_n8n_ai_extraction: { Args: never; Returns: undefined }
      emergency_stop_all_scheduled_jobs: { Args: never; Returns: number }
      enqueue_test_outbound: {
        Args: { p_agent_id: string; p_phone: string }
        Returns: Json
      }
      ensure_app_product_value: {
        Args: { p_value: string }
        Returns: undefined
      }
      enviar_viagem_ao_cliente: { Args: { p_viagem_id: string }; Returns: Json }
      escolher_alternativa: {
        Args: { p_alternativa_id: string; p_item_id: string; p_token: string }
        Returns: Json
      }
      evaluate_alert_condition: {
        Args: { p_card_id: string; p_condition: Json }
        Returns: boolean
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
      find_possible_duplicate_cards: {
        Args: {
          p_data_fim?: string
          p_data_inicio?: string
          p_exclude_card_id?: string
          p_pessoa_principal_id: string
          p_produto: string
        }
        Returns: {
          created_at: string
          data_viagem_fim: string
          data_viagem_inicio: string
          financial_items_count: number
          id: string
          phase_slug: string
          pipeline_stage_id: string
          produto: string
          stage_nome: string
          status_comercial: string
          titulo: string
          valor_estimado: number
          valor_final: number
        }[]
      }
      fix_orphan_conversations: { Args: never; Returns: Json }
      fn_absorver_trip_items_sub_card: {
        Args: { p_sub_card_id: string }
        Returns: Json
      }
      fn_business_minutes_between: {
        Args: { p_a: string; p_b: string; p_org_id?: string }
        Returns: number
      }
      fn_card_stage_history: {
        Args: { p_card_id: string; p_limit?: number }
        Returns: Json
      }
      fn_check_integration_health: { Args: never; Returns: Json }
      fn_enqueue_idle_followups: { Args: never; Returns: Json }
      fn_enqueue_temporal_events: { Args: never; Returns: number }
      fn_infer_trip_item_tipo: {
        Args: { p_description: string }
        Returns: Database["public"]["Enums"]["trip_item_tipo"]
      }
      fn_roteamento_pos_venda_trips: { Args: never; Returns: Json }
      fn_roteamento_pos_venda_trips_diagnose: {
        Args: never
        Returns: {
          c_card_id: string
          c_detalhe: string
          c_motivo: string
          c_stage_atual: string
          c_titulo: string
          c_viagem_fim: string
          c_viagem_inicio: string
        }[]
      }
      fundir_cards: {
        Args: {
          p_card_destino: string
          p_card_origem: string
          p_motivo?: string
        }
        Returns: Json
      }
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
      generate_card_alerts: {
        Args: { p_card_id?: string; p_rule_id: string }
        Returns: Json
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
      get_checklist: {
        Args: { p_participant_id: string; p_token: string }
        Returns: Json
      }
      get_client_by_phone: {
        Args: {
          p_conversation_id?: string
          p_phone_with_9: string
          p_phone_without_9: string
        }
        Returns: Json
      }
      get_encryption_key: { Args: never; Returns: string }
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
      get_my_active_team_id: { Args: never; Returns: string }
      get_my_team_peer_ids: { Args: never; Returns: string[] }
      get_outbound_external_field_id: {
        Args: { p_integration_id: string; p_internal_field: string }
        Returns: string
      }
      get_outbound_queue_stats: {
        Args: { p_agent_id?: string }
        Returns: {
          success_rate_7d: number
          total_failed_today: number
          total_pending: number
          total_sent_today: number
          total_skipped: number
        }[]
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
      get_portal_by_token: { Args: { p_token: string }; Returns: Json }
      get_product_setting: {
        Args: { p_key: string; p_produto?: string }
        Returns: string
      }
      get_scheduled_job_recent_runs: {
        Args: { p_job_name: string; p_limit?: number }
        Returns: {
          duration_ms: number
          end_time: string
          return_message: string
          start_time: string
          status: string
        }[]
      }
      get_scheduled_job_targets: {
        Args: { p_job_name: string }
        Returns: {
          extras: Json
          is_active: boolean
          last_activity_at: string
          link_path: string
          status_label: string
          target_id: string
          target_kind: string
          target_label: string
          target_sublabel: string
        }[]
      }
      get_schema_summary: {
        Args: never
        Returns: {
          count: number
          resource_type: string
        }[]
      }
      get_sub_cards: { Args: { p_parent_id: string }; Returns: Json }
      get_team_member_ids: { Args: { p_team_ids: string[] }; Returns: string[] }
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
      get_trip_plan_by_token: { Args: { p_token: string }; Returns: Json }
      get_trip_portal_by_token: { Args: { p_token: string }; Returns: Json }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_viagem_by_token: { Args: { p_token: string }; Returns: Json }
      get_whatsapp_conversation_messages: {
        Args: { p_contact_id: string; p_limit?: number }
        Returns: Json
      }
      has_role: { Args: { role_name: string }; Returns: boolean }
      hidratar_viagem_de_financeiro: {
        Args: { p_viagem_id: string }
        Returns: Json
      }
      identificar_participante: {
        Args: {
          p_email?: string
          p_nome: string
          p_relacao?: string
          p_telefone?: string
          p_token: string
        }
        Returns: Json
      }
      increment_library_usage: {
        Args: { library_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      is_manager_or_admin: { Args: never; Returns: boolean }
      is_official_meta_phone: {
        Args: { p_phone_number_id: string }
        Returns: boolean
      }
      is_operational: { Args: never; Returns: boolean }
      is_org_active: { Args: { p_org_id: string }; Returns: boolean }
      is_org_admin: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_proactive_event_type: {
        Args: { p_event_type: string }
        Returns: boolean
      }
      is_proposal_flight_sold: {
        Args: { p_flight_id: string }
        Returns: boolean
      }
      is_proposal_item_sold: { Args: { p_item_id: string }; Returns: boolean }
      is_weak_contact_name: { Args: { p_nome: string }; Returns: boolean }
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
      list_analytics_views: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          name: string
          query_spec: Json
          updated_at: string
          viz: string
        }[]
      }
      list_scheduled_jobs_with_status: {
        Args: never
        Returns: {
          category: string
          cron_registered: boolean
          description: string
          frequency_label: string
          impact_tags: string[]
          is_enabled: boolean
          job_name: string
          label: string
          last_run_started_at: string
          last_run_status: string
          last_toggled_at: string
          last_toggled_by: string
        }[]
      }
      listar_cards_abertos_do_contato_echo: {
        Args: {
          p_conversation_id?: string
          p_phone: string
          p_phone_number_id?: string
          p_phone_number_label?: string
        }
        Returns: Json
      }
      listar_fotos: { Args: { p_token: string }; Returns: Json }
      marcar_checklist: {
        Args: {
          p_checked?: boolean
          p_item_key: string
          p_participant_id: string
          p_token: string
        }
        Returns: Json
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
      mover_financial_items: {
        Args: { p_card_destino: string; p_item_ids: string[] }
        Returns: Json
      }
      normalize_cpf: { Args: { cpf_input: string }; Returns: string }
      normalize_name: { Args: { name: string }; Returns: string }
      normalize_phone: { Args: { phone_number: string }; Returns: string }
      normalize_phone_brazil: {
        Args: { phone_number: string }
        Returns: string
      }
      normalize_phone_robust: { Args: { p_phone: string }; Returns: string[] }
      pipeline_phases_duplicate_slugs_count: { Args: never; Returns: number }
      platform_delete_activity_category: {
        Args: { p_key: string }
        Returns: undefined
      }
      platform_end_impersonation: { Args: never; Returns: undefined }
      platform_get_organization: { Args: { p_org_id: string }; Returns: Json }
      platform_get_stats: { Args: never; Returns: Json }
      platform_global_catalog_counts: { Args: never; Returns: Json }
      platform_impersonate_org: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      platform_invite_admin: {
        Args: { p_email: string; p_org_id: string; p_role?: string }
        Returns: string
      }
      platform_list_activity_categories: {
        Args: never
        Returns: {
          created_at: string | null
          key: string
          label: string
          ordem: number | null
          scope: string
          visible: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      platform_list_integration_alerts: {
        Args: { p_limit?: number; p_unresolved_only?: boolean }
        Returns: {
          acknowledged_at: string
          context: Json
          fired_at: string
          id: string
          org_id: string
          org_name: string
          resolved_at: string
          rule_key: string
          status: string
        }[]
      }
      platform_list_integration_outbox: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          action: string
          created_at: string
          destination: string
          entity_type: string
          error_log: string
          id: string
          internal_id: string
          retry_count: number
          status: string
        }[]
      }
      platform_list_integration_pulse: {
        Args: never
        Returns: {
          channel: string
          error_count_24h: number
          event_count_24h: number
          event_count_7d: number
          label: string
          last_error_at: string
          last_event_at: string
        }[]
      }
      platform_list_org_users: {
        Args: { p_org_id: string }
        Returns: {
          active: boolean
          banned_until: string
          created_at: string
          email: string
          id: string
          is_admin: boolean
          is_platform_admin: boolean
          last_sign_in_at: string
          nome: string
          org_id: string
          org_name: string
          role: string
        }[]
      }
      platform_list_organizations: {
        Args: never
        Returns: {
          active: boolean
          card_count: number
          created_at: string
          id: string
          last_activity: string
          logo_url: string
          name: string
          open_card_count: number
          shares_contacts_with_children: boolean
          slug: string
          status: string
          suspended_at: string
          suspended_reason: string
          user_count: number
          workspace_count: number
        }[]
      }
      platform_list_webhook_logs: {
        Args: { p_limit?: number; p_source?: string }
        Returns: {
          created_at: string
          id: string
          payload: Json
          source: string
        }[]
      }
      platform_log_action: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_target_id?: string
          p_target_type: string
        }
        Returns: string
      }
      platform_remove_user_from_org: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      platform_resume_organization: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      platform_set_admin: {
        Args: { p_is_admin: boolean; p_user_id: string }
        Returns: undefined
      }
      platform_set_sharing_flag: {
        Args: { p_enable: boolean; p_org_id: string }
        Returns: undefined
      }
      platform_set_user_active: {
        Args: { p_active: boolean; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      platform_suspend_organization: {
        Args: { p_org_id: string; p_reason?: string }
        Returns: undefined
      }
      platform_upsert_activity_category: {
        Args: {
          p_key: string
          p_label: string
          p_ordem?: number
          p_scope?: string
          p_visible?: boolean
        }
        Returns: string
      }
      preview_alert_rule: { Args: { p_rule_def: Json }; Returns: Json }
      process_all_pending_whatsapp_events: { Args: never; Returns: Json }
      process_message_buffer: {
        Args: { p_debounce_seconds?: number }
        Returns: {
          contact_name: string
          contact_phone: string
          message_count: number
          messages: Json
          org_id: string
          phone_number_id: string
        }[]
      }
      process_outbound_queue: {
        Args: { p_limit?: number }
        Returns: {
          agent_id: string
          card_id: string
          contact_name: string
          contact_phone: string
          contato_id: string
          first_message_config: Json
          form_data: Json
          interaction_mode: string
          org_id: string
          queue_id: string
          trigger_metadata: Json
          trigger_type: string
        }[]
      }
      process_pending_whatsapp_events: { Args: never; Returns: Json }
      process_whatsapp_raw_event: { Args: { event_id: string }; Returns: Json }
      process_whatsapp_raw_event_v2: {
        Args: { event_id: string }
        Returns: Json
      }
      provision_account_with_workspace: {
        Args: {
          p_account_name: string
          p_account_slug: string
          p_admin_email: string
          p_product_name?: string
          p_product_slug?: string
          p_template?: string
          p_workspace_name?: string
          p_workspace_slug?: string
        }
        Returns: Json
      }
      provision_organization: {
        Args: {
          p_admin_email: string
          p_name: string
          p_product_name?: string
          p_product_slug?: string
          p_slug: string
          p_template?: string
        }
        Returns: string
      }
      provision_workspace: {
        Args: {
          p_admin_email: string
          p_name: string
          p_product_name?: string
          p_product_slug?: string
          p_slug: string
          p_template?: string
          p_tenant_id: string
        }
        Returns: string
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
      record_auth_attempt: {
        Args: { p_email: string; p_success: boolean; p_user_agent?: string }
        Returns: undefined
      }
      record_card_open: { Args: { p_card_id: string }; Returns: Json }
      registrar_nps: {
        Args: { p_comentario?: string; p_nota: number; p_token: string }
        Returns: Json
      }
      replace_cadence_steps: {
        Args: { p_steps: Json; p_template_id: string }
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
      requesting_parent_org_id: { Args: never; Returns: string }
      reset_agent_conversations_with_phone: {
        Args: { p_agent_id: string; p_phone: string }
        Returns: Json
      }
      reset_user_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: undefined
      }
      resolve_portal_approval: {
        Args: {
          p_action: string
          p_approval_id: string
          p_notes?: string
          p_token: string
        }
        Returns: Json
      }
      restart_pgnet_worker: { Args: never; Returns: undefined }
      revert_pos_venda_import_items: {
        Args: { p_item_ids: string[]; p_reverted_by: string }
        Returns: Json
      }
      revoke_api_key: { Args: { p_key_id: string }; Returns: boolean }
      rpc_reactivation_assign_bulk: {
        Args: { p_contact_ids: string[]; p_responsavel_id: string }
        Returns: number
      }
      rpc_reactivation_create_cards_bulk: {
        Args: {
          p_contact_ids: string[]
          p_pipeline_id: string
          p_stage_id: string
          p_titulo_prefix?: string
          p_vendas_owner_id?: string
        }
        Returns: {
          card_id: string
          contact_id: string
        }[]
      }
      rpc_reactivation_suppress_bulk: {
        Args: {
          p_contact_ids: string[]
          p_note?: string
          p_reason: string
          p_until?: string
        }
        Returns: number
      }
      rpc_reactivation_unsuppress_bulk: {
        Args: { p_contact_ids: string[] }
        Returns: number
      }
      run_card_alerts_daily: { Args: never; Returns: Json }
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
      save_analytics_view: {
        Args: {
          p_description?: string
          p_name: string
          p_query_spec: Json
          p_viz?: string
        }
        Returns: Json
      }
      save_client_selection: {
        Args: {
          p_item_id: string
          p_option_id?: string
          p_selected: boolean
          p_token: string
        }
        Returns: Json
      }
      scheduled_job_is_enabled: {
        Args: { p_job_name: string }
        Returns: boolean
      }
      search_agent_knowledge_bases: {
        Args: {
          p_agent_id: string
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
        }
        Returns: {
          conteudo: string
          item_id: string
          kb_id: string
          similarity: number
          titulo: string
        }[]
      }
      search_knowledge_base: {
        Args: {
          p_kb_id: string
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
        }
        Returns: {
          conteudo: string
          id: string
          similarity: number
          tags: Json
          titulo: string
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
      send_card_alert: {
        Args: { p_card_id: string; p_message?: string; p_recipient_id: string }
        Returns: Json
      }
      set_card_primary_contact: {
        Args: { p_card_id: string; p_contact_id: string }
        Returns: undefined
      }
      set_integration_setting: {
        Args: {
          p_encrypt?: boolean
          p_key: string
          p_produto?: string
          p_value: string
        }
        Returns: undefined
      }
      set_monde_import_flag: { Args: never; Returns: undefined }
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
      switch_organization: { Args: { p_org_id: string }; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
      update_card_from_ai_extraction: {
        Args: {
          p_briefing_inicial: Json
          p_card_id: string
          p_produto_data: Json
        }
        Returns: Json
      }
      update_contato_principal_from_ai_extraction: {
        Args: { p_card_id: string; p_contact_id: string; p_fields: Json }
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
      upsert_viajantes_from_ai_extraction: {
        Args: { p_card_id: string; p_viajantes: Json }
        Returns: Json
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
      validate_stage_requirements: {
        Args: { p_card_id: string; p_target_stage_id: string }
        Returns: Json
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
      trip_item_status:
        | "rascunho"
        | "proposto"
        | "aprovado"
        | "recusado"
        | "operacional"
        | "vivido"
        | "arquivado"
      trip_item_tipo:
        | "dia"
        | "hotel"
        | "voo"
        | "transfer"
        | "passeio"
        | "refeicao"
        | "seguro"
        | "dica"
        | "voucher"
        | "contato"
        | "texto"
        | "checklist"
      viagem_estado:
        | "desenho"
        | "em_recomendacao"
        | "em_aprovacao"
        | "confirmada"
        | "em_montagem"
        | "aguardando_embarque"
        | "em_andamento"
        | "pos_viagem"
        | "concluida"
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
      trip_item_status: [
        "rascunho",
        "proposto",
        "aprovado",
        "recusado",
        "operacional",
        "vivido",
        "arquivado",
      ],
      trip_item_tipo: [
        "dia",
        "hotel",
        "voo",
        "transfer",
        "passeio",
        "refeicao",
        "seguro",
        "dica",
        "voucher",
        "contato",
        "texto",
        "checklist",
      ],
      viagem_estado: [
        "desenho",
        "em_recomendacao",
        "em_aprovacao",
        "confirmada",
        "em_montagem",
        "aguardando_embarque",
        "em_andamento",
        "pos_viagem",
        "concluida",
      ],
    },
  },
} as const
