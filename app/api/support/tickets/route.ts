import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES=new Set(["login","account","payment","bug","content","performance","other"]);
const STATUSES=new Set(["open","pending","resolved","closed"]);
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
export async function GET(){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const {data,error}=await supabase.from("support_tickets").select("*").eq("user_id",user.id).order("updated_at",{ascending:false});
  if(error){console.error("[support] GET",error.message);return NextResponse.json({success:false,error:"Failed to load tickets."},{status:500});}
  return NextResponse.json({success:true,tickets:data??[]});
 }catch(e){console.error("[support] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
export async function POST(req:Request){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return NextResponse.json({success:false,error:"Invalid request body."},{status:400});
  const subject=typeof body.subject==="string"?body.subject.trim():"";
  const category=body.category===undefined?"other":body.category;
  const message=typeof body.message==="string"?body.message.trim():"";
  if(!subject||subject.length>200)return NextResponse.json({success:false,error:"Invalid subject."},{status:400});
  if(typeof category!=="string"||!CATEGORIES.has(category))return NextResponse.json({success:false,error:"Invalid category."},{status:400});
  if(!message||message.length>5000)return NextResponse.json({success:false,error:"Invalid message."},{status:400});
  const service=createServiceClient();
  const {data:ticket,error}=await service.from("support_tickets").insert({user_id:user.id,subject,category,status:"open"}).select("*").single();
  if(error||!ticket){console.error("[support] POST ticket",error?.message);return NextResponse.json({success:false,error:"Failed to create ticket."},{status:500});}
  const {error:msgErr}=await service.from("support_messages").insert({ticket_id:ticket.id,author_id:user.id,author_role:"user",body:message});
  if(msgErr){console.error("[support] POST message",msgErr.message);return NextResponse.json({success:false,error:"Failed to create ticket message."},{status:500});}
  return NextResponse.json({success:true,ticket,reference:ticket.id},{status:201});
 }catch(e){console.error("[support] POST",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}