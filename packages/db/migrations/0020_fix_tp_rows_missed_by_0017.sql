-- Fixes the six trainees migration 0017 silently skipped.
--
-- 0017 matched each row on (route code, current name). Its generator collapsed
-- runs of whitespace when writing the key, but the names stored by 0008 keep
-- the register's own double spaces - 'EMMANUEL  MAKANTA',
-- 'CLEMENT  KUSEKWA  MASHURUBU' - so `t.name = f.old_name` matched nothing for
-- exactly these six. They received NONE of 0017's updates: not the phone
-- number, and not the occupation and institution corrections either. Every
-- other TP trainee updated correctly.
--
-- Found because tp_with_phone came back 394 where 400 was expected: 364 real
-- rows + 36 test rows, minus these six. The double space is invisible in the
-- dashboard's results grid, which renders HTML and collapses it.
--
-- Keyed here on the EXACT stored name, double spaces included, so the match is
-- provable rather than approximate. The new name is the register's own
-- single-spaced form, so this also tidies the six names as it goes.
--
-- Same guards as 0017: UPDATE only, no row inserted or deleted, and an
-- `is distinct from` chain so re-running changes nothing.

with fix_roster as (
  select * from (values
  ('TP ROUTE 1', 'FREDRICK AKIBA  BEATUS', 'FREDRICK AKIBA BEATUS', 'MVTTC/CAVT/2025/0337', 'Masonry and Bricklaying', 'CHEMBA VTC', 'CHEMBA', 'DODOMA', '0621572245/750884885'),
  ('TP ROUTE 1', 'KULWA MATHIAS  SOLO', 'KULWA MATHIAS SOLO', 'MVTTC/CAVT/2025/0403', 'Masonry and Bricklaying', 'KONGWA DVTC', 'KONGWA', 'DODOMA', '760692073'),
  ('TP ROUTE 6', 'EMMANUEL  MAKANTA', 'EMMANUEL MAKANTA', 'MVTTC/CAVT/2025/0119', 'Electrical Installation', 'VETA RUKWA', 'SUMBAWANGA', 'RUKWA', '629321901'),
  ('TP ROUTE 6', 'CLEMENT  KUSEKWA  MASHURUBU', 'CLEMENT KUSEKWA MASHURUBU', 'MVTTC/CAVT/2025/0315', 'Food Production', 'VETA- RUKWA', 'SUMBAWANGA', 'RUKWA', '746154627'),
  ('TP ROUTE 7', 'MOHAMEDI  Y.  SALIM', 'MOHAMEDI Y. SALIM', 'MVTTC/CAVT/2025/0342', 'Plumbing and Pipe Fitting', 'TANGA RVTSC', 'TANGA', 'TANGA', '778055239'),
  ('TP ROUTE 8', 'MONICA  C. MWAMWAJA', 'MONICA C. MWAMWAJA', 'MVTTC/CAVT/2025/0228', 'Business Operation Assistants', 'VETA LINDI', 'LINDI', 'LINDI', '714786191')
  ) as v(route_code, old_name, new_name, registration_number, occupation,
         institution, district, region, phone)
)
update trainees t set
  name                = f.new_name,
  registration_number = coalesce(f.registration_number, t.registration_number),
  occupation          = f.occupation,
  institution         = f.institution,
  district            = f.district,
  region              = f.region,
  phone               = f.phone
from fix_roster f
join routes r on r.code = f.route_code
where t.route_id = r.id
  and t.name = f.old_name
  and t.track = 'TP'
  and (
    t.name                is distinct from f.new_name
    or t.registration_number is distinct from coalesce(f.registration_number, t.registration_number)
    or t.occupation       is distinct from f.occupation
    or t.institution      is distinct from f.institution
    or t.district         is distinct from f.district
    or t.region           is distinct from f.region
    or t.phone            is distinct from f.phone
  );

-- Afterwards this must return 0:
--   select count(*) from trainees
--   where track = 'TP' and phone is null and registration_number not like 'TEST-%';
