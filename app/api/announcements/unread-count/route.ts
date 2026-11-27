import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const now=new Date().toISOString();
  const {data:anns,error:aErr}=await supabase.from("announcements").select("id").eq("status","published").or(`publish_at.is.null,publish_at.lte.${now}`).or(`expires_at.is.null,expires_at.gt.${now}`);
  if(aErr){console.error("[unread-count]",aErr.message);return NextResponse.json({success:false,error:"Failed to load announcements."},{status:500});}
  const ids=(anns??[]).map((a:any)=>a.id);
  if(ids.length===0)return NextResponse.json({success:true,count:0});
  const {data:reads,error:rErr}=await supabase.from("announcement_reads").select("announcement_id").eq("user_id",user.id).in("announcement_id",ids);
  if(rErr){console.error("[unread-count]",rErr.message);return NextResponse.json({success:false,error:"Failed to load read receipts."},{status:500});}
  const readSet=new Set((reads??[]).map((r:any)=>r.announcement_id));
  const count=ids.filter((id:string)=>!readSet.has(id)).length;
  return NextResponse.json({success:true,count});
 }catch(e){console.error("[unread-count]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
