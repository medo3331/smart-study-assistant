import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const service=createServiceClient();
  const {data:ticket}=await service.from("support_tickets").select("*").eq("id",id).maybeSingle();
  if(!ticket||ticket.user_id!==user.id)return NextResponse.json({success:false,error:"Not found."},{status:404});
  const {data:messages}=await service.from("support_messages").select("*").eq("ticket_id",id).order("created_at",{ascending:true});
  return NextResponse.json({success:true,ticket,messages:messages??[]});
 }catch(e){console.error("[support ticket] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>null);
  const status=body?.status;
  if(status!=="closed")return NextResponse.json({success:false,error:"Users may only close tickets."},{status:400});
  const service=createServiceClient();
  const {data:ticket}=await service.from("support_tickets").select("*").eq("id",id).maybeSingle();
  if(!ticket||ticket.user_id!==user.id)return NextResponse.json({success:false,error:"Not found."},{status:404});
  if(ticket.status==="closed")return NextResponse.json({success:false,error:"Already closed."},{status:400});
  const {data:updated,error}=await service.from("support_tickets").update({status:"closed",updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
  if(error||!updated){console.error("[support close]",error?.message);return NextResponse.json({success:false,error:"Failed to close."},{status:500});}
  return NextResponse.json({success:true,ticket:updated});
 }catch(e){console.error("[support close]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}