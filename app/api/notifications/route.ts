import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}
export async function GET(){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const service=createServiceClient();
  // integrate published announcements into notifications
  const now=new Date().toISOString();
  const {data:anns}=await service.from("announcements").select("*").eq("status","published").or(`publish_at.is.null,publish_at.lte.${now}`).or(`expires_at.is.null,expires_at.gte.${now}`);
  for(const a of anns??[]){
   const {data:existing}=await service.from("notifications").select("id").eq("recipient_id",user.id).eq("type","announcement").eq("title",a.title).maybeSingle();
   if(!existing){
    await service.from("notifications").insert({recipient_id:user.id,type:"announcement",title:a.title,body:a.body,link_url:a.link_url??null});
   }
  }
  const {data,error}=await service.from("notifications").select("*").eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(50);
  if(error){console.error("[notifications] GET",error.message);return NextResponse.json({success:false,error:"Failed to load."},{status:500});}
  return NextResponse.json({success:true,notifications:data??[],unread:(data??[]).filter((n:any)=>!n.read_at).length});
 }catch(e){console.error("[notifications] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
export async function PATCH(req:Request){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>null);
  const service=createServiceClient();
  if(body?.all===true){
   await service.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",user.id).is("read_at",null);
   return NextResponse.json({success:true});
  }
  const id=body?.id;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  await service.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("recipient_id",user.id);
  return NextResponse.json({success:true});
 }catch(e){console.error("[notifications] PATCH",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}