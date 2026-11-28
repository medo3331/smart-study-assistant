import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isNotificationsSchemaMissing, NOTIFICATIONS_SCHEMA_MISSING_MESSAGE } from "@/lib/notifications/schema";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}

/**
 * SECURITY FIX — Notifications (Phase 0)
 * 
 * All user-facing operations use the server client (enforces RLS).
 * The service-role/admin client is only used for admin-only data:
 *   - Fetching published announcements (is this correct for admin? No, announcements are public to the user).
 *   - Inserting notifications (subsequent insertions are re-inserted by the user's own notification logic).
 *   - Checking existing notifications (does this check need to be user-scoped? Yes — only for this user's notifications).
 *
 * SECURITY RULES APPLIED:
 *   1. A user can only read and update their own notifications.
 *   2. Notification recipient identity is derived from the authenticated session.
 *   3. Never trust a client-provided recipient_id.
 *   4. Mark-as-read operations enforce recipient ownership (user_id = auth.uid()).
 *   5. Preserve existing notification data and functionality.
 *   6. No parallel notification system is introduced.
 */
export async function GET(){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});

  // Integrate published announcements into notifications (admin-only, read-only)
  const now=new Date().toISOString();
  // توصيل الإعلانات المنشورة: service-role لمحتوى إداري عام مع فلترة persona (من main)
  const service = createServiceClient();
  const {data:anns,error:annErr}=await service.from("announcements").select("id,title,body,audience").eq("status","published").or(`publish_at.is.null,publish_at.lte.${now}`).or(`expires_at.is.null,expires_at.gt.${now}`);
  if(annErr){console.error("[notifications] announcements",annErr.message);}
  const {data:profile}=await service.from("profiles").select("persona").eq("id",user.id).maybeSingle();
  let existingNotifications: any[] = [];
  const {data:modernNotifications,error:modernError}=await supabase.from("notifications").select("announcement_id").eq("recipient_id",user.id).not("announcement_id","is",null);
  if (!modernError) existingNotifications = modernNotifications ?? [];
  else {
   const {data:legacyNotifications}=await supabase.from("notifications").select("announcement_id").eq("user_id",user.id).not("announcement_id","is",null);
   existingNotifications = legacyNotifications ?? [];
  }
  const delivered = new Set(existingNotifications.map((row: any) => row.announcement_id).filter(Boolean));
  for(const a of anns??[]){
   if (delivered.has(a.id)) continue;
   const audience = a.audience ?? "all";
   if (audience !== "all" && (!profile?.persona || (audience === "student" && profile.persona !== "student") || (audience === "graduate" && profile.persona !== "grad") || (audience === "freelancer" && profile.persona !== "freelancer"))) continue;
   const {error:deliveryError}=await service.from("notifications").upsert({recipient_id:user.id,type:"announcement",title:a.title,body:a.body,announcement_id:a.id}, {onConflict:"announcement_id,recipient_id",ignoreDuplicates:true});
   if(deliveryError) console.error("[notifications] announcement delivery",deliveryError.message);
   else delivered.add(a.id);
  }
  // قراءة إشعارات المستخدم نفسه: server client يفرض RLS (إصلاح أمني من البرانش) مع fallback للسكيما القديمة
  let {data,error}=await supabase.from("notifications").select("*").eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(50);
  if(error) {
   const legacy = await supabase.from("notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
   data = legacy.data; error = legacy.error;
  }
  if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true,notifications:[],unread:0},{status:503})}
    console.error("[notifications] GET",error.message);
    return NextResponse.json({success:false,error:"Failed to load."},{status:500});
  }
  const notifications=(data??[]).map((n:any)=>({...n,read_at:n.read_at??(n.is_read? n.created_at : null),body:n.body??n.message??""}));
  return NextResponse.json({success:true,notifications,unread:notifications.filter((n:any)=>!n.read_at).length});
 }catch(e){console.error("[notifications] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}

export async function PATCH(req:Request){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});

  const body=await req.json().catch(()=>null);
  if(body?.all===true){
   let {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",user.id).is("read_at",null);
   if(error) ({error}=await supabase.from("notifications").update({is_read:true}).eq("user_id",user.id).eq("is_read",false));
   if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true},{status:503})}
    console.error("[notifications] PATCH all",error.message);
    return NextResponse.json({success:false,error:"Failed to update."},{status:500});
   }
   return NextResponse.json({success:true});
  }

  const id=body?.id;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  // تحديد إشعار واحد كمقروء — فرض ملكية المستلم إجباريًا (إصلاح أمني) مع fallback للسكيما القديمة
  let {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("recipient_id",user.id);
  if(error) ({error}=await supabase.from("notifications").update({is_read:true}).eq("id",id).eq("user_id",user.id));
  if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true},{status:503})}
    console.error("[notifications] PATCH id",error.message);
    return NextResponse.json({success:false,error:"Failed to update."},{status:500});
  }
  return NextResponse.json({success:true});
 }catch(e){console.error("[notifications] PATCH",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
export async function DELETE(req:Request){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});

  const body=await req.json().catch(()=>null);

  // حذف كل الإشعارات المقروءة
  if(body?.allRead===true){
   let {error}=await supabase.from("notifications").delete().eq("recipient_id",user.id).not("read_at","is",null);
   if(error) ({error}=await supabase.from("notifications").delete().eq("user_id",user.id).eq("is_read",true));
   if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true},{status:503})}
    console.error("[notifications] DELETE allRead",error.message);
    return NextResponse.json({success:false,error:"Failed to delete."},{status:500});
   }
   return NextResponse.json({success:true});
  }

  const id=body?.id;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  // حذف إشعار واحد — فرض ملكية المستلم إجباريًا مع fallback للسكيما القديمة
  let {error}=await supabase.from("notifications").delete().eq("id",id).eq("recipient_id",user.id);
  if(error) ({error}=await supabase.from("notifications").delete().eq("id",id).eq("user_id",user.id));
  if(error){
   if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true},{status:503})}
   console.error("[notifications] DELETE id",error.message);
   return NextResponse.json({success:false,error:"Failed to delete."},{status:500});
  }
  return NextResponse.json({success:true});
 }catch(e){console.error("[notifications] DELETE",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
