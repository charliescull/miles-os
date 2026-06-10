import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client (SERVICE ROLE) — writes the human decision + realized
// outcome that train the model. The service key never reaches the browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Body = {
  id: string;
  decision?: "bought" | "passed" | "undecided";
  status?: "new" | "reviewing" | "bought" | "passed" | "sold";
  realized_sale_price?: number;
  realized_days_to_sell?: number;
};

export async function POST(req: Request) {
  if (!url || !serviceKey) {
    return Response.json({ error: "server not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, { status: 500 });
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.decision) {
    patch.decision = body.decision;
    patch.decided_at = new Date().toISOString();
    // keep the display status in sync with the decision
    patch.status = body.decision === "bought" ? "bought" : body.decision === "passed" ? "passed" : "reviewing";
  }
  if (body.status) patch.status = body.status;
  if (body.realized_sale_price != null) {
    patch.realized_sale_price = body.realized_sale_price;
    patch.sold_at = new Date().toISOString();
    patch.status = "sold";
    patch.decision = "bought"; // a sold item was, by definition, bought
  }
  if (body.realized_days_to_sell != null) patch.realized_days_to_sell = body.realized_days_to_sell;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase
    .from("opportunities")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, opportunity: data });
}
