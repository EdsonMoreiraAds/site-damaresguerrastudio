import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Download autorizado: a RLS decide se o usuário enxerga o documento; só então geramos URL assinada de 60 s. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Não encontrado", { status: 404 });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401 });
  const { data: doc } = await sb.from("documents").select("id, path, kind").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Não encontrado", { status: 404 });
  const { error: logErr } = await sb.rpc("log_download", { p_document: doc.id });   // auditoria antes de entregar
  if (logErr) return new NextResponse("Não encontrado", { status: 404 });
  const { data } = await supabaseAdmin().storage.from("documentos").createSignedUrl(doc.path, 60, { download: `nota.${doc.kind}` });
  if (!data?.signedUrl) return new NextResponse("Indisponível", { status: 502 });
  return NextResponse.redirect(data.signedUrl, 303);
}
