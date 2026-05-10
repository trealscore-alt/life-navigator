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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_messages: {
        Row: {
          agent_id: string
          clrk_response: Json | null
          content: Json
          created_at: string
          direction: string
          id: string
          message_type: string
          status: string
          user_id: string
        }
        Insert: {
          agent_id: string
          clrk_response?: Json | null
          content?: Json
          created_at?: string
          direction: string
          id?: string
          message_type?: string
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          clrk_response?: Json | null
          content?: Json
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_registry: {
        Row: {
          agent_api_key: string | null
          agent_description: string | null
          agent_endpoint: string | null
          agent_name: string
          allowed_actions: string[] | null
          created_at: string
          id: string
          is_active: boolean | null
          last_seen_at: string | null
          trust_level: Database["public"]["Enums"]["agent_trust_level"]
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_api_key?: string | null
          agent_description?: string | null
          agent_endpoint?: string | null
          agent_name: string
          allowed_actions?: string[] | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          trust_level?: Database["public"]["Enums"]["agent_trust_level"]
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_api_key?: string | null
          agent_description?: string | null
          agent_endpoint?: string | null
          agent_name?: string
          allowed_actions?: string[] | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          trust_level?: Database["public"]["Enums"]["agent_trust_level"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          mode: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_summaries: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_message_id: string | null
          message_count: number
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_message_id?: string | null
          message_count: number
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_message_id?: string | null
          message_count?: number
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_summaries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_summaries_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      clrk_history_events: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          embedding: string | null
          id: string
          kind: string
          metadata: Json
          occurred_at: string
          source: string
          source_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          kind: string
          metadata?: Json
          occurred_at?: string
          source: string
          source_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          source_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clrk_history_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      clrk_memory: {
        Row: {
          access_count: number
          confidence: number | null
          content: string
          created_at: string
          embedding: string | null
          expires_at: string | null
          id: string
          importance: number | null
          kind: string
          last_accessed_at: string | null
          metadata: Json | null
          source: string | null
          source_id: string | null
          superseded_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number
          confidence?: number | null
          content: string
          created_at?: string
          embedding?: string | null
          expires_at?: string | null
          id?: string
          importance?: number | null
          kind: string
          last_accessed_at?: string | null
          metadata?: Json | null
          source?: string | null
          source_id?: string | null
          superseded_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number
          confidence?: number | null
          content?: string
          created_at?: string
          embedding?: string | null
          expires_at?: string | null
          id?: string
          importance?: number | null
          kind?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          source?: string | null
          source_id?: string | null
          superseded_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clrk_memory_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "clrk_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      clrk_subagent_runs: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input: Json
          objective: string
          output: Json | null
          plan: Json
          started_at: string | null
          status: Database["public"]["Enums"]["clrk_subagent_run_status"]
          subagent_id: string
          task_id: string | null
          trace: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          objective: string
          output?: Json | null
          plan?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["clrk_subagent_run_status"]
          subagent_id: string
          task_id?: string | null
          trace?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          objective?: string
          output?: Json | null
          plan?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["clrk_subagent_run_status"]
          subagent_id?: string
          task_id?: string | null
          trace?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clrk_subagent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clrk_subagent_runs_subagent_id_fkey"
            columns: ["subagent_id"]
            isOneToOne: false
            referencedRelation: "clrk_subagents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clrk_subagent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "clrk_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      clrk_subagents: {
        Row: {
          autonomy_level: Database["public"]["Enums"]["clrk_autonomy_level"]
          capabilities: string[]
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          domain: Database["public"]["Enums"]["life_domain"] | null
          error_message: string | null
          guardrails: Json
          handoff_contract: Json
          id: string
          last_deployed_at: string | null
          memory: Json
          metadata: Json | null
          mission: string
          name: string
          parent_task_id: string | null
          result: Json | null
          role: string
          status: Database["public"]["Enums"]["clrk_subagent_status"]
          tool_scope: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          autonomy_level?: Database["public"]["Enums"]["clrk_autonomy_level"]
          capabilities?: string[]
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["life_domain"] | null
          error_message?: string | null
          guardrails?: Json
          handoff_contract?: Json
          id?: string
          last_deployed_at?: string | null
          memory?: Json
          metadata?: Json | null
          mission: string
          name: string
          parent_task_id?: string | null
          result?: Json | null
          role: string
          status?: Database["public"]["Enums"]["clrk_subagent_status"]
          tool_scope?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          autonomy_level?: Database["public"]["Enums"]["clrk_autonomy_level"]
          capabilities?: string[]
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["life_domain"] | null
          error_message?: string | null
          guardrails?: Json
          handoff_contract?: Json
          id?: string
          last_deployed_at?: string | null
          memory?: Json
          metadata?: Json | null
          mission?: string
          name?: string
          parent_task_id?: string | null
          result?: Json | null
          role?: string
          status?: Database["public"]["Enums"]["clrk_subagent_status"]
          tool_scope?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clrk_subagents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clrk_subagents_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "clrk_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      clrk_tasks: {
        Row: {
          autonomy_level: Database["public"]["Enums"]["clrk_autonomy_level"]
          completed_at: string | null
          conversation_id: string | null
          cost_cents_actual: number | null
          cost_cents_estimate: number | null
          created_at: string
          description: string | null
          domain: Database["public"]["Enums"]["life_domain"] | null
          error_message: string | null
          goal_id: string | null
          id: string
          last_executor_run_at: string | null
          max_steps: number
          metadata: Json | null
          next_check_at: string | null
          parent_task_id: string | null
          plan: Json | null
          result: Json | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["clrk_task_status"]
          steps_used: number
          title: string
          trace: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autonomy_level?: Database["public"]["Enums"]["clrk_autonomy_level"]
          completed_at?: string | null
          conversation_id?: string | null
          cost_cents_actual?: number | null
          cost_cents_estimate?: number | null
          created_at?: string
          description?: string | null
          domain?: Database["public"]["Enums"]["life_domain"] | null
          error_message?: string | null
          goal_id?: string | null
          id?: string
          last_executor_run_at?: string | null
          max_steps?: number
          metadata?: Json | null
          next_check_at?: string | null
          parent_task_id?: string | null
          plan?: Json | null
          result?: Json | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["clrk_task_status"]
          steps_used?: number
          title: string
          trace?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autonomy_level?: Database["public"]["Enums"]["clrk_autonomy_level"]
          completed_at?: string | null
          conversation_id?: string | null
          cost_cents_actual?: number | null
          cost_cents_estimate?: number | null
          created_at?: string
          description?: string | null
          domain?: Database["public"]["Enums"]["life_domain"] | null
          error_message?: string | null
          goal_id?: string | null
          id?: string
          last_executor_run_at?: string | null
          max_steps?: number
          metadata?: Json | null
          next_check_at?: string | null
          parent_task_id?: string | null
          plan?: Json | null
          result?: Json | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["clrk_task_status"]
          steps_used?: number
          title?: string
          trace?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clrk_tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clrk_tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "user_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clrk_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "clrk_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefings: {
        Row: {
          briefing_date: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          briefing_date?: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          briefing_date?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      device_data_logs: {
        Row: {
          created_at: string
          data_type: string
          device_id: string
          device_name: string | null
          id: string
          metadata: Json | null
          processed: boolean | null
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          data_type: string
          device_id: string
          device_name?: string | null
          id?: string
          metadata?: Json | null
          processed?: boolean | null
          unit: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          data_type?: string
          device_id?: string
          device_name?: string | null
          id?: string
          metadata?: Json | null
          processed?: boolean | null
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          automation_comfort: string | null
          avatar_url: string | null
          communication_style: string | null
          created_at: string
          current_challenges: string[] | null
          display_name: string | null
          id: string
          onboarding_completed: boolean | null
          personality_type: string | null
          risk_tolerance: string | null
          roles: string[] | null
          time_drains: string[] | null
          top_priorities: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_comfort?: string | null
          avatar_url?: string | null
          communication_style?: string | null
          created_at?: string
          current_challenges?: string[] | null
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          personality_type?: string | null
          risk_tolerance?: string | null
          roles?: string[] | null
          time_drains?: string[] | null
          top_priorities?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_comfort?: string | null
          avatar_url?: string | null
          communication_style?: string | null
          created_at?: string
          current_challenges?: string[] | null
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          personality_type?: string | null
          risk_tolerance?: string | null
          roles?: string[] | null
          time_drains?: string[] | null
          top_priorities?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_posts: {
        Row: {
          auto_approved: boolean | null
          content: string
          created_at: string
          engagement_data: Json | null
          id: string
          media_urls: string[] | null
          metadata: Json | null
          platform: string
          published_at: string | null
          scheduled_for: string | null
          social_account_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_approved?: boolean | null
          content: string
          created_at?: string
          engagement_data?: Json | null
          id?: string
          media_urls?: string[] | null
          metadata?: Json | null
          platform: string
          published_at?: string | null
          scheduled_for?: string | null
          social_account_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_approved?: boolean | null
          content?: string
          created_at?: string
          engagement_data?: Json | null
          id?: string
          media_urls?: string[] | null
          metadata?: Json | null
          platform?: string
          published_at?: string | null
          scheduled_for?: string | null
          social_account_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string | null
          account_handle: string | null
          account_name: string
          created_at: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          platform: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_handle?: string | null
          account_name: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          platform: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_handle?: string | null
          account_name?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          platform?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_domains: {
        Row: {
          created_at: string
          domain: Database["public"]["Enums"]["life_domain"]
          id: string
          is_active: boolean | null
          priority: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: Database["public"]["Enums"]["life_domain"]
          id?: string
          is_active?: boolean | null
          priority?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: Database["public"]["Enums"]["life_domain"]
          id?: string
          is_active?: boolean | null
          priority?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          created_at: string
          description: string | null
          domain: Database["public"]["Enums"]["life_domain"] | null
          id: string
          progress: number | null
          status: string | null
          target_date: string | null
          timeframe: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          domain?: Database["public"]["Enums"]["life_domain"] | null
          id?: string
          progress?: number | null
          status?: string | null
          target_date?: string | null
          timeframe?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          domain?: Database["public"]["Enums"]["life_domain"] | null
          id?: string
          progress?: number | null
          status?: string | null
          target_date?: string | null
          timeframe?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_clrk_history: {
        Args: {
          p_match_count?: number
          p_query_embedding: string
          p_sources?: string[]
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          kind: string
          occurred_at: string
          similarity: number
          source: string
          title: string
        }[]
      }
      match_clrk_memory: {
        Args: {
          p_kinds?: string[]
          p_match_count?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          importance: number
          kind: string
          similarity: number
        }[]
      }
    }
    Enums: {
      agent_trust_level: "trusted" | "limited" | "untrusted"
      app_role: "admin" | "moderator" | "user"
      clrk_autonomy_level:
        | "L0_advisory"
        | "L1_drafting"
        | "L2_assisted"
        | "L3_rule_based"
        | "L4_delegated"
        | "L5_ambient"
      clrk_subagent_run_status:
        | "queued"
        | "running"
        | "awaiting_user"
        | "blocked"
        | "completed"
        | "failed"
        | "cancelled"
      clrk_subagent_status:
        | "draft"
        | "ready"
        | "deployed"
        | "paused"
        | "completed"
        | "failed"
        | "archived"
      clrk_task_status:
        | "pending"
        | "planning"
        | "awaiting_user"
        | "executing"
        | "blocked"
        | "completed"
        | "failed"
        | "cancelled"
      life_domain:
        | "work"
        | "finance"
        | "health"
        | "relationships"
        | "learning"
        | "lifestyle"
        | "ambition"
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
      agent_trust_level: ["trusted", "limited", "untrusted"],
      app_role: ["admin", "moderator", "user"],
      clrk_autonomy_level: [
        "L0_advisory",
        "L1_drafting",
        "L2_assisted",
        "L3_rule_based",
        "L4_delegated",
        "L5_ambient",
      ],
      clrk_subagent_run_status: [
        "queued",
        "running",
        "awaiting_user",
        "blocked",
        "completed",
        "failed",
        "cancelled",
      ],
      clrk_subagent_status: [
        "draft",
        "ready",
        "deployed",
        "paused",
        "completed",
        "failed",
        "archived",
      ],
      clrk_task_status: [
        "pending",
        "planning",
        "awaiting_user",
        "executing",
        "blocked",
        "completed",
        "failed",
        "cancelled",
      ],
      life_domain: [
        "work",
        "finance",
        "health",
        "relationships",
        "learning",
        "lifestyle",
        "ambition",
      ],
    },
  },
} as const
