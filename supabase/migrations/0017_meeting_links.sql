-- The Meetings page shows "Join Meet" and "Open in Calendar" for each booked call. Both links come back from Google
-- when the event is created; keep them with the booking.
alter table meetings_booked add column if not exists meet_link text;
alter table meetings_booked add column if not exists event_link text;
