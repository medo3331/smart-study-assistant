import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>null);
  const text=typeof body?.body==="string"?body.body.trim():"";
  if(!text||text.length>5000)return NextResponse.json({success:false,error:"Invalid message."},{status:400});
  const service=createServiceClient();
  const {data:ticket}=await service.from("support_tickets").select("*").eq("id",id).maybeSingle();
  if(!ticket||ticket.user_id!==user.id)return NextResponse.json({success:false,error:"Not found."},{status:404});
  if(ticket.status==="closed")return NextResponse.json({success:false,error:"Ticket is closed."},{status:400});
  const {data:msg,error}=await service.from("support_messages").insert({ticket_id:id,author_id:user.id,author_role:"user",body:text}).select("*").single();
  if(error||!msg){console.error("[support reply]",error?.message);return NextResponse.json({success:false,error:"Failed to reply."},{status:500});}
  await service.from("support_tickets").update({status:"open",updated_at:new Date().toISOString()}).eq("id",id);
  return NextResponse.json({success:true,message:msg},{status:201});
 }catch(e){console.error("[support reply]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}