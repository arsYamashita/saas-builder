// Minimal fixture standing in for a real `supabase gen types typescript`
// snapshot — only the shape schema-drift-gate-core.ts's parser actually
// reads (public.Tables.<table>.Row) matters here.
export type Database = {
  public: {
    Tables: {
      widgets: {
        Row: {
          id: string
          name: string
          color: string | null
        }
        Insert: {
          id?: string
          name: string
          color?: string | null
        }
        Update: {
          id?: string
          name?: string
          color?: string | null
        }
        Relationships: []
      }
      gadgets: {
        Row: {
          id: string
          widget_id: string
        }
        Insert: {
          id?: string
          widget_id: string
        }
        Update: {
          id?: string
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gadgets_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
  }
}
