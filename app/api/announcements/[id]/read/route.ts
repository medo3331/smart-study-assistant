import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v:any){return typeof v==="string"&&UUID_RE.test(v);}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try {
  const {id}=await params;
  if (!isUuid(id))return NextResponse.json({success:false,error:"Invalid id."},{status:400});
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if (!user)return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  // Verify announcement exists and is active
  const now=new Date().toISOString();
  const {data:ann,error:annError}=await supabase
    .from("announcements")
    .select("id, audience, target_user_ids, target_plan_ids, target_faculty, target_stage, target_grade, status, publish_at, expires_at, schedule_at")
    .eq("id",id)
    .single();
  if (annError||!ann)return NextResponse.json({success:false,error:"Announcement not found or not active."},{status:404});
  // Validate audience eligibility (server-side)
  const audience = ann.audience;
  let isEligible = false;

  if (audience === 'all') {
    isEligible = true;
  } else if (audience === 'targeted' && Array.isArray(ann.target_user_ids) && ann.target_user_ids.includes(user.id)) {
    isEligible = true;
  } else if (audience === 'plan' && Array.isArray(ann.target_plan_ids) && ann.target_plan_ids.includes(user.id)) {
    isEligible = true;
  } else {
    // For faculty/stage/grade, check against user's metadata in auth.users
    const { data: userRecord, error: userErr } = await supabase
      .from('auth.users')
      .select('external_metadata')
      .eq('id', user.id)
      .maybeSingle();

    if (!userErr && userRecord?.external_metadata) {
      const metadata = userRecord.external_metadata as { faculty?: string; stage?: string; grade?: string };
      if (audience === 'faculty' && metadata.faculty === ann.target_faculty) {
        isEligible = true;
      } else if (audience === 'stage' && metadata.stage === ann.target_stage) {
        isEligible = true;
      } else if (audience === 'grade' && metadata.grade === ann.target_grade) {
        isEligible = true;
      }
    }
  }

  if (!isEligible) {
    return NextResponse.json({ success: false, error: 'Not eligible for this announcement.' }, { status: 403 });
  }
  // Validate active dates (superseded scheduled, expired, or not yet published)
  const nowDate = new Date();
  const publishAt=ann.publish_at?new Date(ann.publish_at):new Date(0);
  const expiresAt=ann.expires_at?new Date(ann.expires_at):new Date("9999-12-31T23:59:59Z");
  const scheduleAt=ann.schedule_at?new Date(ann.schedule_at):null;
  if (scheduleAt && scheduleAt > nowDate) return NextResponse.json({ success: false, error: "Announcement not yet scheduled (read before schedule time).", scheduled: true }, { status: 403 });
  if (publishAt > nowDate) return NextResponse.json({ success: false, error: "Announcement not yet published.", published: false }, { status: 403 });
  if (expiresAt <= nowDate) return NextResponse.json({ success: false, error: "Announcement expired.", expired: true }, { status: 403 });
  // Insert read receipt (idempotent via unique constraint on (announcement_id, user_id))
  const {error:insertError}=await supabase.from("announcement_reads").insert({announcement_id:id,user_id:user.id});
  if (insertError){
    if (insertError.code==="23505")return NextResponse.json({success:true,alreadyRead:true});
    console.error("[announcements read]",insertError.message);
    return NextResponse.json({success:false,error:"Failed to record read."},{status:500});
  }
  return NextResponse.json({success:true});
 } catch (e) {console.error("[announcements read]",e);return NextResponse.json({success:false,error:"Unexpected error."},{status:500});}
}
