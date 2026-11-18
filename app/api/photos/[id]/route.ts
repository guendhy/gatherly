import { NextRequest, NextResponse } from "next/server";
import { getDrive, hasAccess } from "@/lib/drive";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  if (!hasAccess(req.nextUrl.searchParams.get("key"))) return NextResponse.json({error:"Forbidden"},{status:403});
  const {id}=await params;
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(id)) return NextResponse.json({error:"Bad photo ID"},{status:400});
  try {
    const {drive,folderId}=getDrive();
    const info=await drive.files.get({fileId:id,fields:"id,parents,mimeType,size",supportsAllDrives:true});
    if (!info.data.parents?.includes(folderId)||!info.data.mimeType?.startsWith("image/")) return NextResponse.json({error:"Not found"},{status:404});
    const image=await drive.files.get({fileId:id,alt:"media",supportsAllDrives:true},{responseType:"arraybuffer"});
    const blob=Buffer.from(image.data as ArrayBuffer);
    return new NextResponse(new Uint8Array(blob),{headers:{"Content-Type":info.data.mimeType,"Cache-Control":"private, max-age=60","X-Content-Type-Options":"nosniff"}});
  } catch(e) {console.error("Drive image error",e);return NextResponse.json({error:"Photo unavailable"},{status:404});}
}
