import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
import { recordAuditLog } from "@/app/admin/actions/audit-log-record";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIENCES=new Set(["all","student","graduate","freelancer"]);
const STATUSES=new Set(["draft","published","archived"]);
const MAX_TITLE=200, MAX_BODY=10000;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
function parseDate(v:any):Date|null|undefined{
 if(v===null)return null; if(v===undefined)return undefined;
 if(typeof v!=="string"||!v.trim())return undefined;
 const d=new Date(v); return Number.isNaN(d.getTime())?undefined:d;
}
function activeQuery(supabase:any){
 const now=new Date().toISOString();
 return supabase.from("announcements").select("*").eq("status","published").or(`publish_at.is.null,publish_at.lte.${now}`).or(`expires_at.is.null,expires_at.gt.${now}`);
}
export async function GET(){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const {data,error}=await activeQuery(supabase).order("created_at",{ascending:false});
  if(error){console.error("[announcements] GET",error.message);return NextResponse.json({success:false,error:"Failed to load announcements."},{status:500});}
  return NextResponse.json({success:true,announcements:data??[]});
 }catch(e){console.error("[announcements] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
async function adminAllowed(user:any){
 if(!user)return false;
 const service=createServiceClient();
 return hasPermission(service,user.id,user.email??null,"announcements.manage");
}
export async function POST(req:Request){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  if(!(await adminAllowed(user)))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return NextResponse.json({success:false,error:"Invalid request body."},{status:400});
  const title=typeof body.title==="string"?body.title.trim():"";
  const bodyText=typeof body.body==="string"?body.body.trim():"";
  if(!title||title.length>MAX_TITLE)return NextResponse.json({success:false,error:"Invalid title."},{status:400});
  if(!bodyText||bodyText.length>MAX_BODY)return NextResponse.json({success:false,error:"Invalid body."},{status:400});
  const audience=body.audience===undefined?"all":body.audience;
  if(typeof audience!=="string"||!AUDIENCES.has(audience))return NextResponse.json({success:false,error:"Invalid audience."},{status:400});
  const status=body.status===undefined?"draft":body.status;
  if(typeof status!=="string"||!STATUSES.has(status))return NextResponse.json({success:false,error:"Invalid status."},{status:400});
  const publishAt=parseDate(body.publish_at);
  if(publishAt===undefined)return NextResponse.json({success:false,error:"Invalid publish_at."},{status:400});
  const expiresAt=parseDate(body.expires_at);
  if(expiresAt===undefined)return NextResponse.json({success:false,error:"Invalid expires_at."},{status:400});
  if(publishAt&&expiresAt&&publishAt>=expiresAt)return NextResponse.json({success:false,error:"publish_at must be before expires_at."},{status:400});
  const now=new Date();
  if(status==="published"&&expiresAt&&expiresAt<=now)return NextResponse.json({success:false,error:"Published announcement cannot already be expired."},{status:400});
  const service=createServiceClient();
  const {data,error}=await service.from("announcements").insert({
   title,body:bodyText,audience,status,
   publish_at:publishAt?publishAt.toISOString():publishAt,
   expires_at:expiresAt?expiresAt.toISOString():expiresAt,
   created_by:user.id
  }).select("*").single();
  if(error){console.error("[announcements] POST",error.message);return NextResponse.json({success:false,error:"Failed to create announcement."},{status:500});}
  await recordAuditLog({ actor: user.id, actor_email: user.email ?? null, action: "announcements.manage", resource_type: "announcement", resource_id: data.id, details: { operation: "create", status, audience }, result: "PASS" });
  return NextResponse.json({success:true,announcement:data},{status:201});
 }catch(e){console.error("[announcements] POST",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
