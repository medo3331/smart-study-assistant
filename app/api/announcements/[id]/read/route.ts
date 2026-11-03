import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const now=new Date().toISOString();
  const {data:ann,error:annError}=await supabase
    .from("announcements")
    .select("id")
    .eq("id",id)
    .eq("status","published")
    .or(`publish_at.is.null,publish_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();
  if(annError){console.error("[announcements read]",annError.message);return NextResponse.json({success:false,error:"Failed to verify announcement."},{status:500});}
  if(!ann)return NextResponse.json({success:false,error:"Announcement not found or not active."},{status:404});
  const {error}=await supabase.from("announcement_reads").insert({announcement_id:id,user_id:user.id});
  if(error){
   if(error.code==="23505")return NextResponse.json({success:true,alreadyRead:true});
   console.error("[announcements read]",error.message);
   return NextResponse.json({success:false,error:"Failed to record read."},{status:500});
  }
  return NextResponse.json({success:true});
 }catch(e){console.error("[announcements read]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
