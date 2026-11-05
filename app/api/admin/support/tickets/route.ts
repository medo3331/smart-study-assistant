import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";
async function adminAllowed(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return false;
 const service=createServiceClient();
 return hasPermission(service,user.id,user.email??null,"support.manage");
}
export async function GET(req:Request){
 if(!(await adminAllowed()))return NextResponse.json({success:false,error:"Forbidden."},{status:403});
 try{
  const service=createServiceClient();
  const url=new URL(req.url);
  const status=url.searchParams.get("status");
  let q=service.from("support_tickets").select("*").order("updated_at",{ascending:false});
  if(status&&["open","pending","resolved","closed"].includes(status))q=q.eq("status",status);
  const {data,error}=await q;
  if(error){console.error("[admin support] GET",error.message);return NextResponse.json({success:false,error:"Failed to load."},{status:500});}
  return NextResponse.json({success:true,tickets:data??[]});
 }catch(e){console.error("[admin support] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}