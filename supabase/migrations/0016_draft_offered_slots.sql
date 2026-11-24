-- Call invites show Riya's two free times in the draft itself (not {slot_1}/{slot_2}). The draft remembers which two
-- slots it offered, so sending can re-check them against her calendar and swap any that were taken meanwhile.
alter table email_drafts add column if not exists offered_slots jsonb;
