import { isAdminRequest } from "@/lib/admin-auth";
import { listSubmissions } from "@/lib/submission-store";
import { exportResults } from "@/lib/results-xlsx";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!isAdminRequest(request.headers)) return Response.json({ error: "管理者認証に失敗しました。" }, { status: 401 });
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) return Response.json({ error: "出力対象が不正です。" }, { status: 400 });
    const selected = new Set(ids);
    const records = (await listSubmissions()).filter(record => selected.has(record.id));
    const bytes = exportResults(records);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="grade4-results.xlsx"',
      "Cache-Control": "no-store",
    } });
  } catch { return Response.json({ error: "Excelを出力できませんでした。" }, { status: 500 }); }
}
