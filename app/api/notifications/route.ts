import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  const {data:anns=[],error:annErr}=await supabase
    .from("announcements")
    .select("*")
    .eq("status","published")
    .or(`publish_at.is.null,publish_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if(annErr){console.error("[notifications] announcements",annErr.message);}

  // Check for existing notifications and insert new announcement notifications (owner: the user)
  if(anns?.length){
    for(const a of anns){
      const {data:existing}=await supabase
        .from("notifications")
        .select("id")
        .eq("recipient_id",user.id)
        .eq("type","announcement")
        .eq("title",a.title)
        .maybeSingle();
      if(!existing){
        await supabase.from("notifications").insert({
          recipient_id:user.id,
          type:"announcement",
          title:a.title,
          body:a.body,
          link_url:a.link_url??null
        });
      }
    }
  }

  // Load user's own notifications (RLS-enforced via server client)
  const {data,error}=await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id",user.id)
    .order("created_at",{ascending:false})
    .limit(50);
  if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true,notifications:[],unread:0},{status:503})}
    console.error("[notifications] GET",error.message);
    return NextResponse.json({success:false,error:"Failed to load."},{status:500});
  }
  return NextResponse.json({success:true,notifications:data??[],unread:(data??[]).filter((n:any)=>!n.read_at).length});
}catch(e){console.error("[notifications] GET",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}

export async function PATCH(req:Request){
 try{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});

  const body=await req.json().catch(()=>null);
  if(body?.all===true){
   // Mark ALL user's notifications as read (RLS-enforced via server client)
   const {error}=await supabase
     .from("notifications")
     .update({read_at:new Date().toISOString()})
     .eq("recipient_id",user.id)
     .is("read_at",null);
   if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true},{status:503})}
    console.error("[notifications] PATCH all",error.message);
    return NextResponse.json({success:false,error:"Failed to update."},{status:500});
   }
   return NextResponse.json({success:true});
  }

  const id=body?.id;
  if(!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});

  // Mark single notification as read — MUST enforce recipient ownership
  const {error}=await supabase
    .from("notifications")
    .update({read_at:new Date().toISOString()})
    .eq("id",id)
    .eq("recipient_id",user.id); // This is a guaranteed filter on the authenticated user — no other user's notifications can be touched.
  if(error){
    if(isNotificationsSchemaMissing(error)){return NextResponse.json({success:false,error:NOTIFICATIONS_SCHEMA_MISSING_MESSAGE,schemaMissing:true},{status:503})}
    console.error("[notifications] PATCH id",error.message);
    return NextResponse.json({success:false,error:"Failed to update."},{status:500});
  }
  return NextResponse.json({success:true});
 }catch(e){console.error("[notifications] PATCH",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}