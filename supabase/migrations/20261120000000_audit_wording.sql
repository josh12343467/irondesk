-- =====================================================================================
-- IronDesk · clearer audit-log wording
--   "insert plan Monthly"  →  "Created plan Monthly"
--   "update classe Yoga"   →  "Edited class Yoga"
-- Replaces public.audit() (the triggers keep pointing at it) and rewrites existing entries.
-- =====================================================================================

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  who  text;
  verb text := case tg_op when 'INSERT' then 'Created' when 'UPDATE' then 'Edited' else 'Deleted' end;
  s    text;
begin
  -- Bulk operations (registration, erasure, retention) set this flag and log one summary themselves,
  -- so cascaded child rows don't flood the log. Member and payment rows are always logged.
  if current_setting('irondesk.quiet', true) = 'on' and tg_table_name not in ('members', 'payments') then
    return null;
  end if;

  who := coalesce(
    (select name from public.members where id = (j ->> 'member_id')::uuid),
    j ->> 'guest_name',
    'member');

  s := case tg_table_name
    when 'members' then case tg_op
      when 'INSERT' then 'Registered new member ' || (j ->> 'name')
      when 'UPDATE' then 'Updated profile of ' || (j ->> 'name')
      else 'Erased member record #' || upper(left(j ->> 'id', 6)) end
    when 'payments' then
      format('Recorded %s payment · %s · %s · ₱%s', j ->> 'kind', j ->> 'label', j ->> 'plan_name', j ->> 'amount')
    when 'check_ins' then 'Checked in ' || who || case when j ->> 'via' = 'qr' then ' (QR)' else '' end
    when 'bookings' then
      (case when tg_op = 'DELETE' then 'Cancelled booking of ' else 'Booked ' end) || who || ' · ' ||
      coalesce((select name from public.classes where id = (j ->> 'class_id')::uuid), 'class') || ' · ' || (j ->> 'session_date')
    when 'measurements' then case tg_op
      when 'INSERT' then 'Logged weigh-in for ' || who || ': ' || (j ->> 'weight_kg') || ' kg'
      else 'Removed a weigh-in entry' end
    when 'consents' then
      format('Recorded %s consent (%s) for %s', j ->> 'type', case when (j ->> 'granted')::boolean then 'yes' else 'no' end, who)
    when 'health_declarations' then 'Recorded health screening for ' || who
    when 'privacy_requests' then case tg_op
      when 'INSERT' then 'Submitted a data ' || (j ->> 'type') || ' request'
      else 'Marked a data ' || (j ->> 'type') || ' request as ' || (j ->> 'status') end
    when 'settings' then 'Updated gym settings'
    when 'plans' then format('%s plan %s (%s days · ₱%s)', verb, j ->> 'name', j ->> 'duration_days', j ->> 'price')
    when 'trainers' then format('%s trainer %s', verb, j ->> 'name')
    when 'classes' then format('%s class %s', verb, j ->> 'name')
    else format('%s %s', verb, tg_table_name)
  end;

  insert into public.activity_log (actor_id, actor_name, action, summary)
  values (auth.uid(), public.actor_name(), lower(tg_op) || ':' || tg_table_name, s);
  return null;
end $$;

-- Reword entries written by the old version.
update public.activity_log
   set summary = regexp_replace(
                   regexp_replace(
                     regexp_replace(
                       regexp_replace(summary, '^Insert ', 'Created '),
                     '^Update ', 'Edited '),
                   '^Delete ', 'Deleted '),
                 '^(Created|Edited|Deleted) classe ', '\1 class ')
 where summary ~ '^(Insert|Update|Delete) ';
