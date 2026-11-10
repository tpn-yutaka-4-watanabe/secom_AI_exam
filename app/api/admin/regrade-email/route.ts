import { isAdminRequest } from "@/lib/admin-auth";
import { getSubmission, saveSubmission } from "@/lib/submission-store";
import { gradeEmailSubmission } from "@/lib/brain-api";
import { regradeSavedEmail, RegradeBusyError } from "@/lib/regrade-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request.headers)) return Response.json({ error: "管理者認証に失敗しました。" }, { status: 401 });
  let id: unknown;
  try { ({ id } = await request.json()); }
  catch { return Response.json({ error: "リクエストが不正です。" }, { status: 400 }); }
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) return Response.json({ error: "受付番号が不正です。" }, { status: 400 });
  try {
    const submission = await regradeSavedEmail(id, { load: getSubmission, save: saveSubmission, grade: gradeEmailSubmission });
    return Response.json({ submission });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "再採点できませんでした。" }, { status: error instanceof RegradeBusyError ? 409 : 500 });
  }
}
