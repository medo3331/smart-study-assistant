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
async function adminAllowed(user:any){
 if(!user)return false;
 const service=createServiceClient();
 return hasPermission(service,user.id,user.email??null,"announcements.manage");
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  if(!(await adminAllowed(user)))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return NextResponse.json({success:false,error:"Invalid request body."},{status:400});
  const updates:any={};
  if(body.title!==undefined){
   const t=typeof body.title==="string"?body.title.trim():"";
   if(!t||t.length>MAX_TITLE)return NextResponse.json({success:false,error:"Invalid title."},{status:400});
   updates.title=t;
  }
  if(body.body!==undefined){
   const t=typeof body.body==="string"?body.body.trim():"";
   if(!t||t.length>MAX_BODY)return NextResponse.json({success:false,error:"Invalid body."},{status:400});
   updates.body=t;
  }
  if(body.audience!==undefined){
   if(typeof body.audience!=="string"||!AUDIENCES.has(body.audience))return NextResponse.json({success:false,error:"Invalid audience."},{status:400});
   updates.audience=body.audience;
  }
  if(body.status!==undefined){
   if(typeof body.status!=="string"||!STATUSES.has(body.status))return NextResponse.json({success:false,error:"Invalid status."},{status:400});
   updates.status=body.status;
  }
  let publishAt:Date|null|undefined;
  let expiresAt:Date|null|undefined;
  if(body.publish_at!==undefined){publishAt=parseDate(body.publish_at); if(publishAt===undefined)return NextResponse.json({success:false,error:"Invalid publish_at."},{status:400}); updates.publish_at=publishAt?publishAt.toISOString():publishAt;}
  if(body.expires_at!==undefined){expiresAt=parseDate(body.expires_at); if(expiresAt===undefined)return NextResponse.json({success:false,error:"Invalid expires_at."},{status:400}); updates.expires_at=expiresAt?expiresAt.toISOString():expiresAt;}
  if(Object.keys(updates).length===0)return NextResponse.json({success:false,error:"No fields to update."},{status:400});
  const service=createServiceClient();
  const {data:existing,error:existingError}=await service.from("announcements").select("status,publish_at,expires_at").eq("id",id).maybeSingle();
  if(existingError){console.error("[announcements] PATCH",existingError.message);return NextResponse.json({success:false,error:"Failed to load announcement."},{status:500});}
  if(!existing)return NextResponse.json({success:false,error:"Announcement not found."},{status:404});
  const now=new Date();
  const nextStatus=updates.status??existing.status;
  const nextPublish=publishAt===undefined?(existing.publish_at?new Date(existing.publish_at):null):publishAt;
  const nextExpires=expiresAt===undefined?(existing.expires_at?new Date(existing.expires_at):null):expiresAt;
  if(nextPublish&&nextExpires&&nextPublish>=nextExpires)return NextResponse.json({success:false,error:"publish_at must be before expires_at."},{status:400});
  if(nextStatus==="published"&&nextExpires&&nextExpires<=now)return NextResponse.json({success:false,error:"Published announcement cannot already be expired."},{status:400});
  updates.updated_at=new Date().toISOString();
  const {data,error}=await service.from("announcements").update(updates).eq("id",id).select("*").maybeSingle();
  if(error){console.error("[announcements] PATCH",error.message);return NextResponse.json({success:false,error:"Failed to update announcement."},{status:500});}
  if(!data)return NextResponse.json({success:false,error:"Announcement not found."},{status:404});
  await recordAuditLog({ actor: user.id, actor_email: user.email ?? null, action: "announcements.manage", resource_type: "announcement", resource_id: id, details: { operation: "update", fields: Object.keys(updates) }, result: "PASS" });
  return NextResponse.json({success:true,announcement:data});
 }catch(e){console.error("[announcements] PATCH",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  if(!(await adminAllowed(user)))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
  const service=createServiceClient();
  const {data,error}=await service.from("announcements").delete().eq("id",id).select("id").maybeSingle();
  if(error){console.error("[announcements] DELETE",error.message);return NextResponse.json({success:false,error:"Failed to delete announcement."},{status:500});}
  if(!data)return NextResponse.json({success:false,error:"Announcement not found."},{status:404});
  await recordAuditLog({ actor: user.id, actor_email: user.email ?? null, action: "announcements.manage", resource_type: "announcement", resource_id: id, details: { operation: "delete" }, result: "PASS" });
  return NextResponse.json({success:true});
 }catch(e){console.error("[announcements] DELETE",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
