-- Seeds the TP Practical instrument/criteria, verbatim from
-- packages/db/src/seed/criteria.ts (transcribed from
-- reference/forms/TP Practical form.txt, itself corrected from the
-- user-supplied "Fomu ya Assessment TP_Practical Final.docx", 2026-09-04
-- — see MEMORY.md).
--
-- One recorded exception to strict verbatim transcription: the source
-- has two items both labeled "vii." in section 2 ("Emphasized safely
-- measure" and "Practical performance intergraded with knowledge
-- thought oral questioning"), with "viii." skipped. The user confirmed
-- the second is item "viii." — applied here and in criteria.ts; the
-- reference/forms/ .txt itself is left as a literal transcription of
-- what the source document actually says.
--
-- "PERSONALITY ATRIBUTIES" [sic] is verbatim (source misspelling).
--
-- Guarded with NOT EXISTS, same pattern as 0005, so this is a no-op if
-- re-run against a database that already has the data.

insert into instruments (code, label, track, max_total)
select 'tp_practical', 'TP Practical', 'TP', 50
where not exists (select 1 from instruments where code = 'tp_practical');

with seed as (
  select * from (values
    -- 1 · LESSON PREPARATION (15)
    ('tp_practical','1','LESSON PREPARATION',15,'i','Availability of scheme of training',1,1),
    ('tp_practical','1','LESSON PREPARATION',15,'ii','Availability of lesson plan',1,2),
    ('tp_practical','1','LESSON PREPARATION',15,'iii','Ability to set learning objectives',1,3),
    ('tp_practical','1','LESSON PREPARATION',15,'iv','Prepare appropriate task',2,4),
    ('tp_practical','1','LESSON PREPARATION',15,'v','Take account on safety requirements',1,5),
    ('tp_practical','1','LESSON PREPARATION',15,'vi','Select training material/aids appropriate to the nature of the task and level of trainees',2,6),
    ('tp_practical','1','LESSON PREPARATION',15,'vii','Select training tools/machine/equipment',1,7),
    ('tp_practical','1','LESSON PREPARATION',15,'viii','Ability to integrate environmental issues into his occupational practice',1,8),
    ('tp_practical','1','LESSON PREPARATION',15,'ix','Preparation of information sheet',1,9),
    ('tp_practical','1','LESSON PREPARATION',15,'x','Preparation of assessment sheet',2,10),
    ('tp_practical','1','LESSON PREPARATION',15,'xi','setting a target time for a task',1,11),
    ('tp_practical','1','LESSON PREPARATION',15,'xii','Organizing student in groups',1,12),
    -- 2 · PRACTICAL SESSION DELIVERY (20)
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'i','Arranging workshop as per given task and observing safely requirements',2,13),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'ii','Task explained clearly and key element emphasized',2,14),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'iii','Ability to use requirement material',1,15),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'iv','Ability to demonstrate clearly',3,16),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'v','Demonstrated mastery of his/her occupation competently',2,17),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'vi','Task performed by trainee, mistakes corrected',3,18),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'vii','Emphasized safely measure',2,19),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'viii','Practical performance intergraded with knowledge thought oral questioning',2,20),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'ix','Compliance of the subject matter with environment',1,21),
    ('tp_practical','2','PRACTICAL SESSION DELIVERY',20,'x','Ability of questioning and handling learners responses',2,22),
    -- 3 · TRAINEES, ASSESSMENT (8)
    ('tp_practical','3','TRAINEES, ASSESSMENT',8,'i','Process assessment done and safely measures observed',3,23),
    ('tp_practical','3','TRAINEES, ASSESSMENT',8,'ii','Final product assessed as per set standards/ criteria',2,24),
    ('tp_practical','3','TRAINEES, ASSESSMENT',8,'iii','Practical performance intergraded with knowledge though oral questioning',1,25),
    ('tp_practical','3','TRAINEES, ASSESSMENT',8,'iv','Trainees progress monitored and recorded',1,26),
    ('tp_practical','3','TRAINEES, ASSESSMENT',8,'v','Work area cleaned, tools and equipment stored as required',1,27),
    -- 4 · SELF EXPRESSION (3)
    ('tp_practical','4','SELF EXPRESSION',3,'i','Speaking and communication skills(confidence, clarity, lucidity fluency, articulation and appropriateness',1,28),
    ('tp_practical','4','SELF EXPRESSION',3,'ii','Audibility of his/her voice',1,29),
    ('tp_practical','4','SELF EXPRESSION',3,'iii','Logic and ability of explaining items',1,30),
    -- 5 · PERSONALITY ATRIBUTIES (4)
    ('tp_practical','5','PERSONALITY ATRIBUTIES',4,'i','Gentleness and appropriate language to learners',1,31),
    ('tp_practical','5','PERSONALITY ATRIBUTIES',4,'ii','Neatness and proper dressing',1,32),
    ('tp_practical','5','PERSONALITY ATRIBUTIES',4,'iii','Emphasized to trainees on occupation ethics',1,33),
    ('tp_practical','5','PERSONALITY ATRIBUTIES',4,'iv','Provide a model of good occupational practices',1,34)
  ) as v(code, section_code, section_label, section_max, item_code, item_label, item_max, order_index)
)
insert into criteria (instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index)
select i.id, s.section_code, s.section_label, s.section_max, s.item_code, s.item_label, s.item_max, s.order_index
from seed s
join instruments i on i.code = s.code
where not exists (select 1 from criteria c where c.instrument_id = i.id);
