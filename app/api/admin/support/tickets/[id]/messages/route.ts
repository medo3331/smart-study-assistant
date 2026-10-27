import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
 const service=createServiceClient();
 if(!(await hasPermission(service,user.id,user.email??null,"support.manage")))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
 try{
  const body=await req.json().catch(()=>null);
  const text=typeof body?.body==="string"?body.body.trim():"";
  if(!text||text.length>5000)return NextResponse.json({success:false,error:"Invalid message."},{status:400});
  const {data:ticket}=await service.from("support_tickets").select("*").eq("id",id).maybeSingle();
  if(!ticket)return NextResponse.json({success:false,error:"Not found."},{status:404});
  const {data:msg,error}=await service.from("support_messages").insert({ticket_id:id,author_id:user.id,author_role:"admin",body:text}).select("*").single();
  if(error||!msg){console.error("[admin reply]",error?.message);return NextResponse.json({success:false,error:"Failed to reply."},{status:500});}
  await service.from("support_tickets").update({status:"pending",updated_at:new Date().toISOString()}).eq("id",id);
  await service.from("notifications").insert({recipient_id:ticket.user_id,type:"support_reply",title:"رد على تذكرتك",body:text.slice(0,200),link_url:"/support"});
  return NextResponse.json({success:true,message:msg},{status:201});
 }catch(e){console.error("[admin reply]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}