import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getDrive, hasAccess } from "@/lib/drive";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_SIZE = 12 * 1024 * 1024;
const TYPES = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);

export async function GET(req:NextRequest) {
  if (!hasAccess(req.nextUrl.searchParams.get("key"))) return NextResponse.json({error:"Invalid event link"},{status:403});
  try {
    const {drive, folderId} = getDrive();
    const res = await drive.files.list({ q:`'${folderId.replaceAll("'", "\'")}' in parents and trashed = false and (mimeType contains 'image/')`, fields:"nextPageToken, files(id,name,mimeType,createdTime,description)", pageSize:100, orderBy:"createdTime desc", supportsAllDrives:true, includeItemsFromAllDrives:true });
    const items = (res.data.files ?? []).filter(f=>Boolean(f.id)).map(f=>({id:f.id!,name:f.name??"Photo",createdAt:f.createdTime??"",by:f.description??"Guest"}));
    return NextResponse.json({photos:items},{headers:{"Cache-Control":"no-store"}});
  } catch(e) { console.error("Drive list error",e); return NextResponse.json({error:"Could not load gallery. Check Drive settings."},{status:500}); }
}

export async function POST(req:NextRequest) {
  if (!hasAccess(req.headers.get("x-event-key"))) return NextResponse.json({error:"Invalid event link"},{status:403});
  const length = Number(req.headers.get("content-length") || "0");
  if (length > MAX_SIZE + 100000) return NextResponse.json({error:"Photo is too large (max 12 MB)"},{status:413});
  try {
    const data = await req.formData();
    const file = data.get("photo");
    if (!(file instanceof File)) return NextResponse.json({error:"Please select a photo"},{status:400});
    if (!TYPES.has(file.type)) return NextResponse.json({error:"Only image files are accepted"},{status:415});
    if (file.size > MAX_SIZE) return NextResponse.json({error:"Photo is too large (max 12 MB)"},{status:413});
    if (!file.size) return NextResponse.json({error:"Empty image"},{status:400});
    const name = String(data.get("name")||"Guest").trim().slice(0,50).replace(/[<>]/g,"") || "Guest";
    const bytes = Buffer.from(await file.arrayBuffer());
    const stamp = new Date().toISOString().replace(/[:.]/g,"-");
    const ext = ({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"} as Record<string,string>)[file.type];
    const {drive,folderId}=getDrive();
    const result = await drive.files.create({requestBody:{name:`Event-${stamp}-${crypto.randomUUID().slice(0,8)}.${ext}`,parents:[folderId],description:name},media:{mimeType:file.type,body:Readable.from(bytes)},fields:"id,name",supportsAllDrives:true});
    return NextResponse.json({ok:true,id:result.data.id});
  } catch(e) { console.error("Drive upload error",e); return NextResponse.json({error:"Upload failed. Please retry."},{status:500}); }
}
