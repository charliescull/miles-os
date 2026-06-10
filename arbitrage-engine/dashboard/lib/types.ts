// Mirrors the `opportunities` table in db/schema.sql. Keep in sync on schema change.
export type OpportunityStatus = "new" | "reviewing" | "bought" | "passed" | "sold";

export interface Comp {
  ebay_item_id?: string | null;
  title?: string | null;
  sold_price: number;
  shipping_price?: number | null;
  sold_date?: string | null;
  condition?: string | null;
  url?: string | null;
  similarity?: number | null;
}

export interface Opportunity {
  id: string;
  created_at: string;
  updated_at: string;
  scraped_item_id: string;

  title: string;
  source: string;
  source_url: string;
  model_number: string | null;
  brand: string | null;
  condition: string | null;
  image_url: string | null;

  ask_price: number;
  target_sell_price: number;
  freight_cost: number;
  platform_fee: number;
  processing_fee: number;
  insurance_fee: number;
  total_cost: number;
  net_profit: number;
  roi: number;

  sold_count_30d: number | null;
  adv: number | null;
  est_days_to_liquidate: number | null;
  liquidity_ok: boolean;

  comps: Comp[];
  status: OpportunityStatus;

  // self-learning loop (migration 0002_ml.sql)
  decision?: "undecided" | "bought" | "passed" | null;
  decided_at?: string | null;
  realized_sale_price?: number | null;
  realized_days_to_sell?: number | null;
  realized_net_profit?: number | null;
  sold_at?: string | null;
  model_score?: number | null;       // predicted realized net profit ($)
  model_confidence?: number | null;  // 0..1
}
