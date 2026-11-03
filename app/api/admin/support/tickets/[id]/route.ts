import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
async function adminAllowed(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return false;const service=createServiceClient();return hasPermission(service,user.id,user.email??null,"support.manage");}
async function adminUser(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();return user;}
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
 if(!(await adminAllowed()))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
 try{
  const service=createServiceClient();
  const {data:ticket}=await service.from("support_tickets").select("*").eq("id",id).maybeSingle();
  if(!ticket)return NextResponse.json({success:false,error:"Not found."},{status:404});
  const {data:messages}=await service.from("support_messages").select("*").eq("ticket_id",id).order("created_at",{ascending:true});
  return NextResponse.json({success:true,ticket,messages:messages??[]});
 }catch(e){console.error("[admin support] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
 if(!(await adminAllowed()))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
 try{
  const body=await req.json().catch(()=>null);
  const status=body?.status;
  if(!["open","pending","resolved","closed"].includes(status))return NextResponse.json({success:false,error:"Invalid status."},{status:400});
  const service=createServiceClient();
  const {data:ticket}=await service.from("support_tickets").select("*").eq("id",id).maybeSingle();
  if(!ticket)return NextResponse.json({success:false,error:"Not found."},{status:404});
  const {data:updated,error}=await service.from("support_tickets").update({status,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
  if(error||!updated){console.error("[admin support PATCH]",error?.message);return NextResponse.json({success:false,error:"Failed to update."},{status:500});}
  await service.from("notifications").insert({recipient_id:ticket.user_id,type:"support_status",title:"تحديث حالة التذكرة",body:`تم تغيير حالة تذكرتك إلى ${status}.`,link_url:`/support`});
  return NextResponse.json({success:true,ticket:updated});
 }catch(e){console.error("[admin support PATCH]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}