-- LIVE VERIFICATION — Education Onboarding Schema + Taxonomy Relations
-- Run this in Supabase SQL Editor after applying db/onboarding-education-roles.sql

-- 1) Schema extension present?
SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('education_stage_id','education_grade_id','education_track_id','persona','onboarded_at','role');

-- 2) Taxonomy canonical records present (must not hardcode IDs — read from DB)
SELECT 'stages', code, name FROM public.education_stages WHERE code IN ('PRIMARY','PREPARATORY','SECONDARY','BACCALAUREATE') ORDER BY code;
SELECT 'grades_primary', name, code FROM public.education_grades WHERE stage_id IN (SELECT id FROM public.education_stages WHERE code='PRIMARY') ORDER BY order_index;
SELECT 'grades_prep', name, code FROM public.education_grades WHERE stage_id IN (SELECT id FROM public.education_stages WHERE code='PREPARATORY') ORDER BY order_index;
SELECT 'grades_secondary', name, code FROM public.education_grades WHERE stage_id IN (SELECT id FROM public.education_stages WHERE code='SECONDARY') ORDER BY order_index;
SELECT 'grades_baccalaureate', name, code FROM public.education_grades WHERE stage_id IN (SELECT id FROM public.education_stages WHERE code='BACCALAUREATE') ORDER BY order_index;
SELECT 'tracks_bacc', name, code FROM public.education_tracks WHERE stage_id IN (SELECT id FROM public.education_stages WHERE code='BACCALAUREATE') ORDER BY name;

-- 3) RLS on taxonomy (must allow public read)
SELECT schemaname, tablename, polname FROM pg_policies WHERE tablename IN ('education_stages','education_grades','education_tracks');

-- 4) Profile RLS (must allow owner update / public select for role read)
SELECT schemaname, tablename FROM pg_tables WHERE tablename='profiles';
