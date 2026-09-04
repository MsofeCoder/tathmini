-- Seeds the TP Theory and IPT instruments/criteria, verbatim from
-- packages/db/src/seed/criteria.ts (itself transcribed from
-- reference/forms/TP Theory form.txt and reference/forms/IPT assessment
-- form.txt — wording, section numbers and item letters/numbers copied
-- exactly, per AGENTS.md).
--
-- TP Practical is deliberately NOT included: its verbatim source has two
-- numbering defects (a repeated "vii." in section 2; an unnumbered final
-- section) that need the user's confirmation before seeding — see
-- MEMORY.md. Seeding it with a guessed fix would violate the same rule
-- this file exists to honour.
--
-- Guarded with NOT EXISTS on both inserts so this migration is a no-op
-- when re-run against a database that already has the data — it was
-- first applied as an ad hoc data load direct against the real Supabase
-- project (2026-09-04, see MEMORY.md) before this file existed; applying
-- this migration there afterward must not create a second `tp_theory`/
-- `ipt` instrument. Also makes it safe to run unconditionally in the
-- local Docker workflow and CI, alongside every other numbered migration.

insert into instruments (code, label, track, max_total)
select 'tp_theory', 'TP Theory', 'TP', 50
where not exists (select 1 from instruments where code = 'tp_theory');

insert into instruments (code, label, track, max_total)
select 'ipt', 'IPT', 'IPT', 70
where not exists (select 1 from instruments where code = 'ipt');

with seed as (
  select * from (values
    -- TP Theory (41 items, sections 1..10, total 50)
    ('tp_theory','1','LESSON PREPARATION',6,'i','Availability of scheme of work and lesson plan',1,1),
    ('tp_theory','1','LESSON PREPARATION',6,'ii','Ability to state lesson objectives and competence',1,2),
    ('tp_theory','1','LESSON PREPARATION',6,'iii','Acceptable sequencing of lesson plan components',1,3),
    ('tp_theory','1','LESSON PREPARATION',6,'iv','Correlation of stages, assessment activities and certainty of specific objectives',1,4),
    ('tp_theory','1','LESSON PREPARATION',6,'v','Take account on safety requirements',0.5,5),
    ('tp_theory','1','LESSON PREPARATION',6,'vi','Selection and preparation of teaching aids',0.5,6),
    ('tp_theory','1','LESSON PREPARATION',6,'vii','Ability to keep students record',1,7),
    ('tp_theory','2','SKILLS AND KNOWLEDGE',10,'i','Ability to use recall questions',1,8),
    ('tp_theory','2','SKILLS AND KNOWLEDGE',10,'ii','Mastery of subject matter',3,9),
    ('tp_theory','2','SKILLS AND KNOWLEDGE',10,'iii','Sequence of content',2,10),
    ('tp_theory','2','SKILLS AND KNOWLEDGE',10,'iv','Compliance of the subject matter with environment',1,11),
    ('tp_theory','2','SKILLS AND KNOWLEDGE',10,'v','Skills of questioning and handling learners responses',1,12),
    ('tp_theory','2','SKILLS AND KNOWLEDGE',10,'vi','Emphasize safety measures',2,13),
    ('tp_theory','3','TEACHING METHODS',6,'i','Selection of appropriate methods',1,14),
    ('tp_theory','3','TEACHING METHODS',6,'ii','Proper application of selected methods',2,15),
    ('tp_theory','3','TEACHING METHODS',6,'iii','Effectiveness of applied methods',2,16),
    ('tp_theory','3','TEACHING METHODS',6,'iv','Promote full participation of all trainees',1,17),
    ('tp_theory','4','TEACHING AND LEARNING AIDS',8,'i','Having them in the class',1,18),
    ('tp_theory','4','TEACHING AND LEARNING AIDS',8,'ii','Compliance with specific objectives',2,19),
    ('tp_theory','4','TEACHING AND LEARNING AIDS',8,'iii','Appearance, Size and visibility',1,20),
    ('tp_theory','4','TEACHING AND LEARNING AIDS',8,'iv','Creativity and innovativeness',2,21),
    ('tp_theory','4','TEACHING AND LEARNING AIDS',8,'v','Ability of using them',2,22),
    ('tp_theory','5','SELF EXPRESSION',3,'i','Speaking and communication skills (Competence, Loudness, Clarity, Lucidity/fluency, articulation and appropriateness)',1,23),
    ('tp_theory','5','SELF EXPRESSION',3,'ii','Audibility of his/her voice in the class',1,24),
    ('tp_theory','5','SELF EXPRESSION',3,'iii','Logic and ability of explaining',1,25),
    ('tp_theory','6','CHALKBOARD /FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK',4,'i','Decency and readability of writings',2,26),
    ('tp_theory','6','CHALKBOARD /FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK',4,'ii','Arrangement of work',1,27),
    ('tp_theory','6','CHALKBOARD /FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK',4,'iii','Proper positioning during explanation',1,28),
    ('tp_theory','7','STUDENTS ACTIVITIES',3,'i','Quantity, quality and adequacy to student',1,29),
    ('tp_theory','7','STUDENTS ACTIVITIES',3,'ii','Correlation with specific objectives',1,30),
    ('tp_theory','7','STUDENTS ACTIVITIES',3,'iii','Correlation with learners daily life experience',1,31),
    ('tp_theory','8','CLASSROOM CONTROL',3,'i','Class management and discipline of the class',1,32),
    ('tp_theory','8','CLASSROOM CONTROL',3,'ii','Ability to solve problems arising during the lesson',1,33),
    ('tp_theory','8','CLASSROOM CONTROL',3,'iii','Classroom organization',1,34),
    ('tp_theory','9','PERSONALITY',2,'i','Gentleness and appropriate language to learners',0.5,35),
    ('tp_theory','9','PERSONALITY',2,'ii','Neatness of dressing',0.5,36),
    ('tp_theory','9','PERSONALITY',2,'iii','Neatness of the body',0.5,37),
    ('tp_theory','9','PERSONALITY',2,'iv','Ability to draw attention',0.5,38),
    ('tp_theory','10','SELF ASSESSMENT OF THE LESSON',5,'i','How his/her comments reflect the success and failure of objectives',2,39),
    ('tp_theory','10','SELF ASSESSMENT OF THE LESSON',5,'ii','Strategies for improvement',2,40),
    ('tp_theory','10','SELF ASSESSMENT OF THE LESSON',5,'iii','Acceptance of the advice given by the examiner',1,41),
    -- IPT (14 items, sections A..F, total 70)
    ('ipt','A','INDUSTRIAL DISCIPLINE, WORK ORGANISATION AND WORKING RELATIONS',10,'1','Attendance, punctuality and compliance with the working hours, rules, and the chain of command of the industry',5,1),
    ('ipt','A','INDUSTRIAL DISCIPLINE, WORK ORGANISATION AND WORKING RELATIONS',10,'2','Planning and organisation of own work, preparation of the workstation before starting a job, and working relations with supervisors, colleagues and clients',5,2),
    ('ipt','B','OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT',15,'3','Correct use of personal protective equipment and compliance with safety rules, warning signs and permit-to-work requirements of the industry',5,3),
    ('ipt','B','OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT',15,'4','Safe handling of tools, machines, materials, chemicals and energy sources; identification of hazards and reporting of incidents and near misses',5,4),
    ('ipt','B','OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT',15,'5','Housekeeping, waste segregation and disposal, and compliance with the environmental requirements of the industry',5,5),
    ('ipt','C','INTERPRETATION OF TECHNICAL INFORMATION AND JOB PREPARATION',10,'6','Interpretation of engineering drawings, sketches, specifications, manuals, job cards and work instructions',5,6),
    ('ipt','C','INTERPRETATION OF TECHNICAL INFORMATION AND JOB PREPARATION',10,'7','Selection of the correct materials, tools, equipment and process for the job, and their proper handling and storage',5,7),
    ('ipt','D','INDUSTRIAL OPERATIONS AND WORKMANSHIP',15,'8','Setting up, adjusting, operating and controlling machines, equipment, plant and processes',5,8),
    ('ipt','D','INDUSTRIAL OPERATIONS AND WORKMANSHIP',15,'9','Execution of the occupational operations in the correct sequence and in accordance with the industrial procedure',5,9),
    ('ipt','D','INDUSTRIAL OPERATIONS AND WORKMANSHIP',15,'10','Accuracy of measurement and marking out, and the quality, finish and durability of the completed work against the industrial standard',5,10),
    ('ipt','E','MAINTENANCE, TESTING AND QUALITY ASSURANCE',10,'11','Servicing, preventive and corrective maintenance of tools, equipment, machines and installations',5,11),
    ('ipt','E','MAINTENANCE, TESTING AND QUALITY ASSURANCE',10,'12','Testing, inspection, fault diagnosis and corrective action against the industrial quality standard',5,12),
    ('ipt','F','PRODUCTIVITY, TECHNOLOGY AND INDUSTRIAL RECORDS',10,'13','Productivity: economical use of time, materials, energy and consumables, and application of current industrial technology, methods and standards',5,13),
    ('ipt','F','PRODUCTIVITY, TECHNOLOGY AND INDUSTRIAL RECORDS',10,'14','Keeping of industrial records — job cards, readings, test results and the daily logbook — and clear reporting to the Industrial Supervisor',5,14)
  ) as v(code, section_code, section_label, section_max, item_code, item_label, item_max, order_index)
)
insert into criteria (instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index)
select i.id, s.section_code, s.section_label, s.section_max, s.item_code, s.item_label, s.item_max, s.order_index
from seed s
join instruments i on i.code = s.code
where not exists (select 1 from criteria c where c.instrument_id = i.id);
