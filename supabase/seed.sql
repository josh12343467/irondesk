-- Optional starter data: plans, trainers and a weekly class schedule. No personal data.
-- Run once in the Supabase SQL editor after the migration. Edit names/prices to match your gym.

update public.settings set gym_name = 'Demo Fitness Gym', walk_in_price = 100 where id = 1;

insert into public.plans (name, duration_days, price) values
  ('Monthly', 30, 1200),
  ('Quarterly', 90, 3200),
  ('Semi-Annual', 180, 6000),
  ('Annual', 365, 10500);

with t as (
  insert into public.trainers (name, specialty, phone) values
    ('Coach Migs Alonzo', 'Strength & Powerlifting', ''),
    ('Coach Lea Manalo', 'Zumba & Dance Fitness', ''),
    ('Coach Rey Salazar', 'Boxing & Muay Thai', ''),
    ('Coach Jen Ocampo', 'HIIT & Yoga', '')
  returning id, name
)
insert into public.classes (name, trainer_id, weekday, start_time, duration_min, capacity, tone)
select c.name, t.id, c.weekday, c.start_time, c.duration, c.capacity, c.tone
from (values
  ('Morning HIIT',        'Coach Jen Ocampo',  1, '06:30', 45, 15, 'amber'),
  ('Zumba Night',         'Coach Lea Manalo',  1, '18:30', 60, 25, 'rose'),
  ('Boxing Basics',       'Coach Rey Salazar', 2, '19:00', 60, 12, 'sky'),
  ('Yoga Flow',           'Coach Jen Ocampo',  3, '07:00', 60, 18, 'teal'),
  ('Powerlifting Clinic', 'Coach Migs Alonzo', 3, '17:30', 90,  8, 'lime'),
  ('Zumba Night',         'Coach Lea Manalo',  4, '18:30', 60, 25, 'rose'),
  ('Muay Thai',           'Coach Rey Salazar', 4, '19:30', 75, 12, 'violet'),
  ('Morning HIIT',        'Coach Jen Ocampo',  5, '06:30', 45, 15, 'amber'),
  ('Strength 101',        'Coach Migs Alonzo', 6, '09:00', 60, 10, 'lime'),
  ('Sunday Yoga',         'Coach Jen Ocampo',  0, '08:00', 60, 18, 'teal')
) as c(name, trainer, weekday, start_time, duration, capacity, tone)
join t on t.name = c.trainer;
