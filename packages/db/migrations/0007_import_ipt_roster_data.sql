-- Imports the real September 2026 IPT roster: 13 users (linking the Auth
-- accounts created via packages/db/src/scripts/create-accounts.ts to
-- packages/db/src/data/ipt-accounts.ts), 5 routes, 118 trainees, and 236
-- assignments (each trainee x both route assessors). See MEMORY.md.
--
-- Trainees are inserted AS-IS, known duplicates included ("Adeni Mwanitu"
-- and "Heri Ayubu" each appear on two different routes; two other pairs
-- of different trainees share one phone number each) — the user's
-- explicit "for now" instruction. ROADMAP.md Phase 3 now tracks the
-- manual trainee-to-route reassignment tool that will let a Super Admin
-- fix cases like this by hand; nothing here resolves them automatically.
--
-- Two data-mapping calls worth flagging (no direct equivalent in the
-- source roster, which has SN/NAME/SEX/TRADE/REGIONAL/DISTRICT/COMPANY/
-- PHONE NO only):
--   - trainees.course (NOT NULL) is set to 'TC-TVTE' for every row here —
--     CONTEXT.md's glossary term for "the teacher-education programme
--     trainees are enrolled in" — rather than the workbook's long
--     descriptive header text, to match the TP roster's short-code
--     convention ('CAVT' etc.). Flagged for confirmation, not blocking.
--   - The SEX column in the source has no home in trainees (no such
--     column exists) and is not imported.
--
-- Each route's two assessors come from the source's "ASSESSORS: X & Y"
-- text, X as slot a1, Y as slot a2. Route 2's a1 is Aron Franco's
-- SEPARATE supervisor account (aron.franco.supervisor), not his
-- super_admin account (aron.franco) — see MEMORY.md.
--
-- Guarded with NOT EXISTS throughout, same pattern as 0005/0006, so this
-- is a no-op if re-run against a database that already has this data.

-- ── users: link the 13 real Auth accounts ──────────────────────────

insert into users (id, role, name, email)
select au.id, v.role::app_role, v.name, v.email
from (values
  ('msofe.coder@tathmini.internal', 'super_admin', 'Msofe Coder'),
  ('aron.franco@tathmini.internal', 'super_admin', 'Aron Franco'),
  ('adam.msofe.supervisor@tathmini.internal', 'supervisor', 'Adam Msofe'),
  ('aron.franco.supervisor@tathmini.internal', 'supervisor', 'Aron Franco'),
  ('evodius.kadason@tathmini.internal', 'supervisor', 'Evodius Kadason'),
  ('misyao.nunda@tathmini.internal', 'supervisor', 'Misyao Nunda'),
  ('lilian.makwinya@tathmini.internal', 'supervisor', 'Lilian Makwinya'),
  ('holly.kaje@tathmini.internal', 'supervisor', 'Holly Kaje'),
  ('nickson.kinyamagoha@tathmini.internal', 'supervisor', 'Nickson Kinyamagoha'),
  ('gladness.mdoe@tathmini.internal', 'supervisor', 'Gladness Mdoe'),
  ('daud.mafige@tathmini.internal', 'supervisor', 'Daud Mafige'),
  ('coletha.ndelwa@tathmini.internal', 'supervisor', 'Coletha Ndelwa'),
  ('fausta.makweta@tathmini.internal', 'supervisor', 'Fausta Makweta')
) as v(email, role, name)
join auth.users au on au.email = v.email
where not exists (select 1 from users u where u.id = au.id);

-- ── routes ──────────────────────────────────────────────────────────

insert into routes (code, label, supervisor_a1_id, supervisor_a2_id)
select v.code, v.label, a1.id, a2.id
from (values
  ('IPT ROUTE 1', 'MORO/PWANI/DSM', 'evodius.kadason@tathmini.internal', 'misyao.nunda@tathmini.internal'),
  ('IPT ROUTE 2', 'MORO/DODOMA/KILIMANJARO', 'aron.franco.supervisor@tathmini.internal', 'lilian.makwinya@tathmini.internal'),
  ('IPT ROUTE 3', 'MORO/SHINYANGA/KAGERA', 'holly.kaje@tathmini.internal', 'nickson.kinyamagoha@tathmini.internal'),
  ('IPT ROUTE 4', 'MBEYA/IRINGA/RUVUMA', 'gladness.mdoe@tathmini.internal', 'daud.mafige@tathmini.internal'),
  ('IPT ROUTE 5', 'MOROGORO/KILOMBERO', 'coletha.ndelwa@tathmini.internal', 'fausta.makweta@tathmini.internal')
) as v(code, label, a1_email, a2_email)
join users a1 on a1.email = v.a1_email
join users a2 on a2.email = v.a2_email
where not exists (select 1 from routes r where r.code = v.code);

-- ── trainees (118, as-is, duplicates included) ─────────────────────

with trainee_seed as (
  select * from (values
    -- IPT ROUTE 1 (31)
    ('IPT ROUTE 1','OSCAR LEORNARD','Electrical','DSM','Kinondoni','radio services','785062085'),
    ('IPT ROUTE 1','ELISHA JOEL','Electrical','DSM','Kinondoni','radio services','628044175'),
    ('IPT ROUTE 1','MOHAMED MASERA','Civil','DSM','Kibiti','njopeka ltd','688907371'),
    ('IPT ROUTE 1','GEORGE DAVID','AUTO','DSM','Kinondoni','kilimanjro ltd','710232279'),
    ('IPT ROUTE 1','ANORLD BURYAGABA','Electrical','DSM','kibaha','Tanzania China Trade and Tourism develoment limited','653032731'),
    ('IPT ROUTE 1','ANETH LUMATO','Electrical','DSM','kibaha','backbone','685170864'),
    ('IPT ROUTE 1','FRANSISCO WILIAM','Civil','DSM','ilala','managing co.ltd','679880519'),
    ('IPT ROUTE 1','ELIAS JOHN KAJIRU','FOOD','DSM','ubungo','tbl','676851481'),
    ('IPT ROUTE 1','IBRAHIMU DODI','Civil','DSM','temeke','Tarura','686964175'),
    ('IPT ROUTE 1','INNOCENT ANACLETH','MECH','DSM','ilala','nyemela group','753943890'),
    ('IPT ROUTE 1','EMANUEL FREDY','Electrical','DSM','mbagala','azam','702568506'),
    ('IPT ROUTE 1','GODFREY MADAFU','Civil','DSM','temeke','Tarura','714029411'),
    ('IPT ROUTE 1','SAMWELI DAWITE','Electrical','PWANI','mkuranga','neel salt','652100116'),
    ('IPT ROUTE 1','ELISHA JAMES','Electrical','PWANI','mkuranga','neel salt','613264535'),
    ('IPT ROUTE 1','BARAKA OBADIA','AUTO','DSM','ilala','Said Salim Bhakhersa','694314842'),
    ('IPT ROUTE 1','ISSA SIMBA','Electrical','PWANI','kibaha','Tanzania China Trade and Tourism develoment limited','756752465'),
    ('IPT ROUTE 1','SIPHA JACKSON','Electrical','PWANI','kibaha','Tanzania China Trade and Tourism develoment limited','769695004'),
    ('IPT ROUTE 1','HAFIDHU MBENA','Civil','PWANI','mkuranga','tanroads','712736545'),
    ('IPT ROUTE 1','SILVA MKONDA','CIVIL','MOROGORO','MOROGORO','MOROGORO MUNICIPAL','656775245'),
    ('IPT ROUTE 1','GETRUDA EDWARD','CIVIL','MOROGORO','MOROGORO','MOROGORO MUNICIPAL','613264255'),
    ('IPT ROUTE 1','ABDALLAH CHIKULA','CIVIL','MOROGORO','MOROGORO','MOROGORO MUNICIPAL','697257162'),
    ('IPT ROUTE 1','JACOB SHEOZA','CIVIL','MOROGORO','MOROGORO','MOROGORO MUNICIPAL','762622256'),
    ('IPT ROUTE 1','JULIANA MASANGWE','Electrical','MOROGORO','MOROGORO','WRMTZ','752403004'),
    ('IPT ROUTE 1','AIDA MWAIPAJA','Electrical','MOROGORO','MOROGORO','WRMTZ','753131320'),
    ('IPT ROUTE 1','HAMISI KAPAYA','Electrical','MOROGORO','MOROGORO','WRMTZ','620114880'),
    ('IPT ROUTE 1','PHILOMENA KUZENZA','Electrical','MOROGORO','MOROGORO','WRMTZ','783944072'),
    ('IPT ROUTE 1','JOSHUA IZACK','Electrical','MOROGORO','MOROGORO','WRMTZ','617892997'),
    ('IPT ROUTE 1','ANISETI PHILOMEN','Electrical','MOROGORO','MOROGORO','WRMTZ','796306189'),
    ('IPT ROUTE 1','GRACE JOSEPH','Electrical','MOROGORO','MOROGORO','WRMTZ','757110697'),
    ('IPT ROUTE 1','ISAYA SELEMANI','Electrical','MOROGORO','MOROGORO','WRMTZ','625989108'),
    ('IPT ROUTE 1','JUSTIN AMOS MWITA','CIVIL','MOROGORO','MOROGORO','YARD','746553297'),
    -- IPT ROUTE 2 (30)
    ('IPT ROUTE 2','DISMAS MASSAWE','Electrical','KILIMANJARO','Moshi (Mjin)','TPC','622237547'),
    ('IPT ROUTE 2','AMON NJAU','Electrical','KILIMANJARO','Moshi (Mjin)','TPC','764378916'),
    ('IPT ROUTE 2','JOSHUA ANDREA','Electrical','KILIMANJARO','Moshi (Mjin)','TPC','612657725'),
    ('IPT ROUTE 2','GREYSON NTULA','Electrical','KILIMANJARO','Moshi (Mjin)','TPC','624767260'),
    ('IPT ROUTE 2','OTHMAN KYOZA','AUTO','KILIMANJARO','Moshi (Mjin)','TEMESA','613899498'),
    ('IPT ROUTE 2','RAMADHAN M. SALI','AUTO','KILIMANJARO','Moshi (Mjin)','TEMESA','676032018'),
    ('IPT ROUTE 2','Joachim Jovenary','Civil','DODOMA','Dodoma','NHC','616885985'),
    ('IPT ROUTE 2','Bright Anderson','Civil','DODOMA','Dodoma','NHC','699611214'),
    ('IPT ROUTE 2','Jackson Wilson','Civil','DODOMA','Dodoma','NHC','694460740'),
    ('IPT ROUTE 2','Alfred Richard','Civil','DODOMA','Dodoma','NHC','671991188'),
    ('IPT ROUTE 2','Athumani Omary','Civil','DODOMA','Dodoma','NHC','761538527'),
    ('IPT ROUTE 2','Joshua Masanja','Civil','DODOMA','Dodoma','NHC','762025175'),
    ('IPT ROUTE 2','Adeni Mwanitu','MEC','DODOMA','Dodoma','Zone AUTO','684419544'),
    ('IPT ROUTE 2','Stephano Mgode','Civil','DODOMA','Dodoma','NHC','654108217'),
    ('IPT ROUTE 2','Fadhili Linu Sail','Civil','DODOMA','Dodoma','Tarura','749982575'),
    ('IPT ROUTE 2','Cosmas Peter Kavishe','Electrical','DODOMA','Dodoma','TRC','712461667'),
    ('IPT ROUTE 2','Daudi Mwihambi','Electrical','DODOMA','Dodoma','TRC','784748616'),
    ('IPT ROUTE 2','Cosmas Mchodo','Electrical','DODOMA','Dodoma','TRC','787968897'),
    ('IPT ROUTE 2','Hakika Kabuje','Electrical','SINGIDA','SINGIDA','Mount Meru','742953072'),
    ('IPT ROUTE 2','DAVID NICOLLAUS','Electrical','MOROGORO','KILOSA','MKULANZI','613191032'),
    ('IPT ROUTE 2','MASASI WILLIAM','Electrical','MOROGORO','MOROGORO','MKULANZI','755162691'),
    ('IPT ROUTE 2','AVITH RUTAHINGULURWA','Electrical','MOROGORO','MVOMERO','MTIBWA SUGAR','741841409'),
    ('IPT ROUTE 2','GIFT AUSTADIUS','Electrical','MOROGORO','MOROGORO','TANESCO','711538725'),
    ('IPT ROUTE 2','HERI AYUBU','MECH','MOROGORO','MOROGORO','TANROAD','615099230'),
    ('IPT ROUTE 2','ADROF FRANSISKO','MECH','MOROGORO','MOROGORO','TANROAD','746607790'),
    ('IPT ROUTE 2','JIMILA NDINGA','MECH','MOROGORO','MOROGORO','TANROAD','788516739'),
    ('IPT ROUTE 2','NDUSHI NYANZA','MECH','MOROGORO','MOROGORO','TANROAD','786531105'),
    ('IPT ROUTE 2','FURAHA GODFREY','CIVIL','MOROGORO','MOROGORO','TANROAD','762415247'),
    ('IPT ROUTE 2','JOACHIM ALBERT','AUTO','MOROGORO','MOROGORO','TEMESA','621787499'),
    ('IPT ROUTE 2','JOSEPHAT KUSOLA','MECH','MOROGORO','MOROGORO','TUMBAKU','629678515'),
    -- IPT ROUTE 3 (21)
    ('IPT ROUTE 3','Aziza Ntandu','Electrical','SHINYANGA','Shinyanga','Gilitu','755520610'),
    ('IPT ROUTE 3','Upendo Mariveth','Electrical','SHINYANGA','Shinyanga','Gilitu','756174972'),
    ('IPT ROUTE 3','Prisca Tikili','Electrical','SHINYANGA','Shinyanga','Gilitu','624140723'),
    ('IPT ROUTE 3','Giveness Makiluka','Electrical','SHINYANGA','Shinyanga','Gilitu','623512463'),
    ('IPT ROUTE 3','Henley Cyprian','AUTO','KAGERA','Bukoba','Kagera Sugar','621703844'),
    ('IPT ROUTE 3','Richard Godwin','AUTO','KAGERA','Bukoba','Kagera Sugar','618103361'),
    ('IPT ROUTE 3','Simon Kiwuyo','AUTO','KAGERA','Bukoba','Kagera Sugar','698943174'),
    ('IPT ROUTE 3','Elemerick Kibirizi','Electrical','KAGERA','Bukoba','Kagera Sugar','686900881'),
    ('IPT ROUTE 3','Anson Cyprian','Electrical','KAGERA','Bukoba','Bukopu','737383892'),
    ('IPT ROUTE 3','Frank John','Electrical','KAGERA','Ngara','Ngara coffee','746599460'),
    ('IPT ROUTE 3','Gizbert Alchad','MECH','MWANZA','NYAMAGANA','TANESCO','753293725'),
    ('IPT ROUTE 3','wasembe lusinde','MECH','MWANZA','NYAMAGANA','TANESCO','752071892'),
    ('IPT ROUTE 3','Vincent Mlowe','MECH','MWANZA','NYAMAGANA','TANESCO','621655806'),
    ('IPT ROUTE 3','BARAKA KHAMIS','Electrical','MOROGORO','MOROGORO','TRC','626912160'),
    ('IPT ROUTE 3','FATUMA OMARY','Electrical','MOROGORO','MOROGORO','TRC','685416471'),
    ('IPT ROUTE 3','BARAKA LUCAS','Electrical','MOROGORO','MOROGORO','TRC','613904202'),
    ('IPT ROUTE 3','KAMESE KASONDE','Electrical','MOROGORO','MOROGORO','TRC','611840675'),
    ('IPT ROUTE 3','EMMANUEL KIULA','Electrical','MOROGORO','MOROGORO','TRC','769075007'),
    ('IPT ROUTE 3','ALEX NZIKU','Electrical','MOROGORO','MOROGORO','TRC','617892997'),
    ('IPT ROUTE 3','ELIA MALEKELA','Electrical','MOROGORO','MOROGORO','TRC','622426453'),
    ('IPT ROUTE 3','ALTONOZA SANGA','Electrical','MOROGORO','MOROGORO','TRC','792925907'),
    -- IPT ROUTE 4 (16)
    ('IPT ROUTE 4','Joseph M Mwambona','Electrical','Mbeya','Mbeya','TBL','765626160'),
    ('IPT ROUTE 4','Onai Jastis','AUTO','MBEYA','Mbeya','Tazara','652825127'),
    ('IPT ROUTE 4','Heri Ayubu','AUTO','MBEYA','Mbeya','Tazara','615099230'),
    ('IPT ROUTE 4','Wasembe Lusinde','AUTO','MBEYA','Mbeya','Tazara','677762951'),
    ('IPT ROUTE 4','Eliabu Mlyuka','AUTO','MBEYA','Mbeya','Tazara','712338723'),
    ('IPT ROUTE 4','Adeni Mwanitu','AUTO','MBEYA','Mbeya','Tazara','684419544'),
    ('IPT ROUTE 4','Philipo G Kumegelaumfu','Civil','MBEYA','Mbeya','TANROADS','766003681'),
    ('IPT ROUTE 4','Merensiana Mwinuka','Electrical','Iringa','Iringa','Mtanga','755627339'),
    ('IPT ROUTE 4','Tabana Nyamahanga','Civil','IRINGA','Iringa','TANROADS','757496986'),
    ('IPT ROUTE 4','Zahara Chalamila','Civil','IRINGA','Iringa','TANROADS','768659368'),
    ('IPT ROUTE 4','Mussa Michael','Food','IRINGA','Iringa','Shafa Agro Lmtd','741643372'),
    ('IPT ROUTE 4','Selestina Matola','Food','IRINGA','Iringa','Shafa Agro Lmtd','675969377'),
    ('IPT ROUTE 4','Constantino Mbuhe','Civil','IRINGA','Iringa','gnms contractor lmtd','689612721'),
    ('IPT ROUTE 4','Ally Rajabu','AUTO','RUVUMA','SONGEA','TANROADS','613131424'),
    ('IPT ROUTE 4','Peter Machumu','CIVIL','RUVUMA','SONGEA','TANROADS','659223550'),
    ('IPT ROUTE 4','Augustine Mwape','FOOD','RUVUMA','MBINGA','MCCCO','629107287'),
    -- IPT ROUTE 5 (20)
    ('IPT ROUTE 5','ATHUMAN MBWELA','CIVIL','MOROGORO','KILOMBERO','HALMASHAURI','654571886'),
    ('IPT ROUTE 5','OTHMAN RASHID','Electrical','MOROGORO','KILOMBERO','HALMASHAURI','622538845'),
    ('IPT ROUTE 5','HEMEDI HEMEDI','Electrical','MOROGORO','KILOMBERO','HALMASHAURI','783944072'),
    ('IPT ROUTE 5','BIMKUBWA BABU','Electrical','MOROGORO','MOROGORO','MAGUNIA','613677980'),
    ('IPT ROUTE 5','LOYCE BUNYALA','Electrical','MOROGORO','MOROGORO','MAGUNIA','710544041'),
    ('IPT ROUTE 5','PRISCA JOHN','Electrical','MOROGORO','MOROGORO','MAGUNIA','673755958'),
    ('IPT ROUTE 5','BLESS AMOS','MECH','MOROGORO','MOROGORO','MAGUNIA','680579070'),
    ('IPT ROUTE 5','FRED KASWAMILA','MECH','MOROGORO','MOROGORO','MAGUNIA','761841532'),
    ('IPT ROUTE 5','SEFANIA ISACK','Electrical','MOROGORO','MOROGORO','MAGUNIA','685445822'),
    ('IPT ROUTE 5','ISSA SIMBA','MECH','MOROGORO','MOROGORO','MAGUNIA','621241891'),
    ('IPT ROUTE 5','SALUM CHOROROKA','Electrical','MOROGORO','MOROGORO','MAGUNIA','674846537'),
    ('IPT ROUTE 5','SEBASTIAN FESTO','AUTO','MOROGORO','MOROGORO','TOYOTA, KILAKALA','616631471'),
    ('IPT ROUTE 5','OTHMAN KYOZA','AUTO','MOROGORO','MOROGORO','TOYOTA, KILAKALA','69389498'),
    ('IPT ROUTE 5','NEMUHINA HUSSEIN','AUTO','MOROGORO','MOROGORO','TOYOTA, KILAKALA','615569208'),
    ('IPT ROUTE 5','KAMALDINI MZAZA','FOOD','MOROGORO','MOROGORO','SHAMBA MILK','628916922'),
    ('IPT ROUTE 5','RUCIANA FRANCIS','FOOD','MOROGORO','MOROGORO','SHAMBA MILK','695744635'),
    ('IPT ROUTE 5','SALMINA SAID','FOOD','MOROGORO','MOROGORO','SHAMBA MILK','777023078'),
    ('IPT ROUTE 5','VENANSIA NOVATUS','FOOD','MOROGORO','MOROGORO','SHAMBA MILK','774740726'),
    ('IPT ROUTE 5','BWIRE DOTTO','FOOD','MOROGORO','MOROGORO','SHAMBA MILK','694230590'),
    ('IPT ROUTE 5','ABUBAKAR KULUNGE','FOOD','MOROGORO','MOROGORO','SHAMBA MILK','658203936')
  ) as v(route_code, name, occupation, region, district, institution, phone)
)
insert into trainees (name, course, occupation, institution, district, region, phone, track, route_id)
select ts.name, 'TC-TVTE', ts.occupation, ts.institution, ts.district, ts.region, ts.phone, 'IPT', r.id
from trainee_seed ts
join routes r on r.code = ts.route_code
where not exists (
  select 1 from trainees t
  where t.route_id = r.id and t.name = ts.name and t.phone is not distinct from ts.phone
);

-- ── assignments: every trainee x both of their route's assessors ──

insert into assignments (trainee_id, supervisor_id, slot)
select t.id, r.supervisor_a1_id, 'a1'
from trainees t
join routes r on r.id = t.route_id
where t.track = 'IPT'
  and not exists (
    select 1 from assignments a
    where a.trainee_id = t.id and a.supervisor_id = r.supervisor_a1_id
  );

insert into assignments (trainee_id, supervisor_id, slot)
select t.id, r.supervisor_a2_id, 'a2'
from trainees t
join routes r on r.id = t.route_id
where t.track = 'IPT'
  and not exists (
    select 1 from assignments a
    where a.trainee_id = t.id and a.supervisor_id = r.supervisor_a2_id
  );
