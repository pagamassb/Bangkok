-- Make someone an organiser (they can add, move, cancel and delete events,
-- and see the guest list). They must have signed in to the site once first.
-- Supabase > SQL Editor > New query > paste > change the name > Run.

-- 1) Find the person:
select id, display_name, role, created_at from public.profiles order by created_at desc;

-- 2) Promote them (replace the name, or use their id instead):
update public.profiles set role = 'organiser' where display_name = 'Your Name Here';

-- To remove organiser rights:
-- update public.profiles set role = 'dancer' where display_name = 'Their Name';

-- To delete all the sample events once you have real ones:
-- delete from public.events where is_sample = true;
