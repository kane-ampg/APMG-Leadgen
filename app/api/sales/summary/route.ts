import { type NextRequest } from "next/server";
import { guardResponse, requirePermission } from "@/lib/rbac/server";
import { generateLeadSummary, type LeadFacts } from "@/lib/ai/leadSummary";

/**
 * POST /api/sales/summary — (re)generate the AI brief for a lead.
 * Permission-gated to sales.view. Body: LeadFacts. Returns { summary, source }.
 *
 * NOTE: requirePermission currently resolves the role from the apmg-role cookie
 * / x-apmg-role header (placeholder). Once Supabase auth is wired, swap that for
 * a verified session — see lib/rbac/server.ts.
 */
export async function POST(req: NextRequest) {
  const guard = requirePermission(req, "sales.view");
  if (!guard.ok) return guardResponse(guard);

  let body: Partial<LeadFacts>;
  try {
    body = (await req.json()) as Partial<LeadFacts>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.business) {
    return Response.json({ error: "business is required" }, { status: 400 });
  }

  const result = await generateLeadSummary(body as LeadFacts);
  return Response.json(result);
}
