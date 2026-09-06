/**
 * Verbatim criteria for TP Theory and IPT, transcribed from
 * reference/forms/TP Theory form.txt and reference/forms/IPT assessment form.txt.
 * Wording, section numbers and item letters/numbers are copied exactly —
 * never paraphrased, rounded or renumbered (AGENTS.md).
 *
 * TP Practical is deliberately NOT included here. Its verbatim source has
 * two numbering defects (a repeated "vii." in section 2; an unnumbered
 * final section) that need the user's confirmation before seeding — see
 * MEMORY.md. Seeding it with a guessed fix would violate the same rule
 * this file exists to honour.
 */

export interface CriterionSeed {
  sectionCode: string;
  sectionLabel: string;
  sectionMax: number;
  itemCode: string;
  itemLabel: string;
  itemMax: number;
}

export const TP_THEORY_MAX_TOTAL = 50;

export const TP_THEORY_CRITERIA: CriterionSeed[] = [
  // 1 · LESSON PREPARATION (6)
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'i',
    itemLabel: 'Availability of scheme of work and lesson plan',
    itemMax: 1,
  },
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'ii',
    itemLabel: 'Ability to state lesson objectives and competence',
    itemMax: 1,
  },
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'iii',
    itemLabel: 'Acceptable sequencing of lesson plan components',
    itemMax: 1,
  },
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'iv',
    itemLabel: 'Correlation of stages, assessment activities and certainty of specific objectives',
    itemMax: 1,
  },
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'v',
    itemLabel: 'Take account on safety requirements',
    itemMax: 0.5,
  },
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'vi',
    itemLabel: 'Selection and preparation of teaching aids',
    itemMax: 0.5,
  },
  {
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 6,
    itemCode: 'vii',
    itemLabel: 'Ability to keep students record',
    itemMax: 1,
  },

  // 2 · SKILLS AND KNOWLEDGE (10)
  {
    sectionCode: '2',
    sectionLabel: 'SKILLS AND KNOWLEDGE',
    sectionMax: 10,
    itemCode: 'i',
    itemLabel: 'Ability to use recall questions',
    itemMax: 1,
  },
  {
    sectionCode: '2',
    sectionLabel: 'SKILLS AND KNOWLEDGE',
    sectionMax: 10,
    itemCode: 'ii',
    itemLabel: 'Mastery of subject matter',
    itemMax: 3,
  },
  {
    sectionCode: '2',
    sectionLabel: 'SKILLS AND KNOWLEDGE',
    sectionMax: 10,
    itemCode: 'iii',
    itemLabel: 'Sequence of content',
    itemMax: 2,
  },
  {
    sectionCode: '2',
    sectionLabel: 'SKILLS AND KNOWLEDGE',
    sectionMax: 10,
    itemCode: 'iv',
    itemLabel: 'Compliance of the subject matter with environment',
    itemMax: 1,
  },
  {
    sectionCode: '2',
    sectionLabel: 'SKILLS AND KNOWLEDGE',
    sectionMax: 10,
    itemCode: 'v',
    itemLabel: 'Skills of questioning and handling learners responses',
    itemMax: 1,
  },
  {
    sectionCode: '2',
    sectionLabel: 'SKILLS AND KNOWLEDGE',
    sectionMax: 10,
    itemCode: 'vi',
    itemLabel: 'Emphasize safety measures',
    itemMax: 2,
  },

  // 3 · TEACHING METHODS (6)
  {
    sectionCode: '3',
    sectionLabel: 'TEACHING METHODS',
    sectionMax: 6,
    itemCode: 'i',
    itemLabel: 'Selection of appropriate methods',
    itemMax: 1,
  },
  {
    sectionCode: '3',
    sectionLabel: 'TEACHING METHODS',
    sectionMax: 6,
    itemCode: 'ii',
    itemLabel: 'Proper application of selected methods',
    itemMax: 2,
  },
  {
    sectionCode: '3',
    sectionLabel: 'TEACHING METHODS',
    sectionMax: 6,
    itemCode: 'iii',
    itemLabel: 'Effectiveness of applied methods',
    itemMax: 2,
  },
  {
    sectionCode: '3',
    sectionLabel: 'TEACHING METHODS',
    sectionMax: 6,
    itemCode: 'iv',
    itemLabel: 'Promote full participation of all trainees',
    itemMax: 1,
  },

  // 4 · TEACHING AND LEARNING AIDS (8)
  {
    sectionCode: '4',
    sectionLabel: 'TEACHING AND LEARNING AIDS',
    sectionMax: 8,
    itemCode: 'i',
    itemLabel: 'Having them in the class',
    itemMax: 1,
  },
  {
    sectionCode: '4',
    sectionLabel: 'TEACHING AND LEARNING AIDS',
    sectionMax: 8,
    itemCode: 'ii',
    itemLabel: 'Compliance with specific objectives',
    itemMax: 2,
  },
  {
    sectionCode: '4',
    sectionLabel: 'TEACHING AND LEARNING AIDS',
    sectionMax: 8,
    itemCode: 'iii',
    itemLabel: 'Appearance, Size and visibility',
    itemMax: 1,
  },
  {
    sectionCode: '4',
    sectionLabel: 'TEACHING AND LEARNING AIDS',
    sectionMax: 8,
    itemCode: 'iv',
    itemLabel: 'Creativity and innovativeness',
    itemMax: 2,
  },
  {
    sectionCode: '4',
    sectionLabel: 'TEACHING AND LEARNING AIDS',
    sectionMax: 8,
    itemCode: 'v',
    itemLabel: 'Ability of using them',
    itemMax: 2,
  },

  // 5 · SELF EXPRESSION (3)
  {
    sectionCode: '5',
    sectionLabel: 'SELF EXPRESSION',
    sectionMax: 3,
    itemCode: 'i',
    itemLabel:
      'Speaking and communication skills (Competence, Loudness, Clarity, Lucidity/fluency, articulation and appropriateness)',
    itemMax: 1,
  },
  {
    sectionCode: '5',
    sectionLabel: 'SELF EXPRESSION',
    sectionMax: 3,
    itemCode: 'ii',
    itemLabel: 'Audibility of his/her voice in the class',
    itemMax: 1,
  },
  {
    sectionCode: '5',
    sectionLabel: 'SELF EXPRESSION',
    sectionMax: 3,
    itemCode: 'iii',
    itemLabel: 'Logic and ability of explaining',
    itemMax: 1,
  },

  // 6 · CHALKBOARD/FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK (4)
  {
    sectionCode: '6',
    sectionLabel: 'CHALKBOARD /FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK',
    sectionMax: 4,
    itemCode: 'i',
    itemLabel: 'Decency and readability of writings',
    itemMax: 2,
  },
  {
    sectionCode: '6',
    sectionLabel: 'CHALKBOARD /FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK',
    sectionMax: 4,
    itemCode: 'ii',
    itemLabel: 'Arrangement of work',
    itemMax: 1,
  },
  {
    sectionCode: '6',
    sectionLabel: 'CHALKBOARD /FLIPCHART/WHITEBOARD/MULTIMEDIA/METAPLAN CARDS WORK',
    sectionMax: 4,
    itemCode: 'iii',
    itemLabel: 'Proper positioning during explanation',
    itemMax: 1,
  },

  // 7 · STUDENTS ACTIVITIES (3)
  {
    sectionCode: '7',
    sectionLabel: 'STUDENTS ACTIVITIES',
    sectionMax: 3,
    itemCode: 'i',
    itemLabel: 'Quantity, quality and adequacy to student',
    itemMax: 1,
  },
  {
    sectionCode: '7',
    sectionLabel: 'STUDENTS ACTIVITIES',
    sectionMax: 3,
    itemCode: 'ii',
    itemLabel: 'Correlation with specific objectives',
    itemMax: 1,
  },
  {
    sectionCode: '7',
    sectionLabel: 'STUDENTS ACTIVITIES',
    sectionMax: 3,
    itemCode: 'iii',
    itemLabel: 'Correlation with learners daily life experience',
    itemMax: 1,
  },

  // 8 · CLASSROOM CONTROL (3)
  {
    sectionCode: '8',
    sectionLabel: 'CLASSROOM CONTROL',
    sectionMax: 3,
    itemCode: 'i',
    itemLabel: 'Class management and discipline of the class',
    itemMax: 1,
  },
  {
    sectionCode: '8',
    sectionLabel: 'CLASSROOM CONTROL',
    sectionMax: 3,
    itemCode: 'ii',
    itemLabel: 'Ability to solve problems arising during the lesson',
    itemMax: 1,
  },
  {
    sectionCode: '8',
    sectionLabel: 'CLASSROOM CONTROL',
    sectionMax: 3,
    itemCode: 'iii',
    itemLabel: 'Classroom organization',
    itemMax: 1,
  },

  // 9 · PERSONALITY (2)
  {
    sectionCode: '9',
    sectionLabel: 'PERSONALITY',
    sectionMax: 2,
    itemCode: 'i',
    itemLabel: 'Gentleness and appropriate language to learners',
    itemMax: 0.5,
  },
  {
    sectionCode: '9',
    sectionLabel: 'PERSONALITY',
    sectionMax: 2,
    itemCode: 'ii',
    itemLabel: 'Neatness of dressing',
    itemMax: 0.5,
  },
  {
    sectionCode: '9',
    sectionLabel: 'PERSONALITY',
    sectionMax: 2,
    itemCode: 'iii',
    itemLabel: 'Neatness of the body',
    itemMax: 0.5,
  },
  {
    sectionCode: '9',
    sectionLabel: 'PERSONALITY',
    sectionMax: 2,
    itemCode: 'iv',
    itemLabel: 'Ability to draw attention',
    itemMax: 0.5,
  },

  // 10 · SELF ASSESSMENT OF THE LESSON (5)
  {
    sectionCode: '10',
    sectionLabel: 'SELF ASSESSMENT OF THE LESSON',
    sectionMax: 5,
    itemCode: 'i',
    itemLabel: 'How his/her comments reflect the success and failure of objectives',
    itemMax: 2,
  },
  {
    sectionCode: '10',
    sectionLabel: 'SELF ASSESSMENT OF THE LESSON',
    sectionMax: 5,
    itemCode: 'ii',
    itemLabel: 'Strategies for improvement',
    itemMax: 2,
  },
  {
    sectionCode: '10',
    sectionLabel: 'SELF ASSESSMENT OF THE LESSON',
    sectionMax: 5,
    itemCode: 'iii',
    itemLabel: 'Acceptance of the advice given by the examiner',
    itemMax: 1,
  },
];

export const IPT_MAX_TOTAL = 70;

export const IPT_CRITERIA: CriterionSeed[] = [
  // A · INDUSTRIAL DISCIPLINE, WORK ORGANISATION AND WORKING RELATIONS (10)
  {
    sectionCode: 'A',
    sectionLabel: 'INDUSTRIAL DISCIPLINE, WORK ORGANISATION AND WORKING RELATIONS',
    sectionMax: 10,
    itemCode: '1',
    itemLabel:
      'Attendance, punctuality and compliance with the working hours, rules, and the chain of command of the industry',
    itemMax: 5,
  },
  {
    sectionCode: 'A',
    sectionLabel: 'INDUSTRIAL DISCIPLINE, WORK ORGANISATION AND WORKING RELATIONS',
    sectionMax: 10,
    itemCode: '2',
    itemLabel:
      'Planning and organisation of own work, preparation of the workstation before starting a job, and working relations with supervisors, colleagues and clients',
    itemMax: 5,
  },

  // B · OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT (15)
  {
    sectionCode: 'B',
    sectionLabel: 'OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT',
    sectionMax: 15,
    itemCode: '3',
    itemLabel:
      'Correct use of personal protective equipment and compliance with safety rules, warning signs and permit-to-work requirements of the industry',
    itemMax: 5,
  },
  {
    sectionCode: 'B',
    sectionLabel: 'OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT',
    sectionMax: 15,
    itemCode: '4',
    itemLabel:
      'Safe handling of tools, machines, materials, chemicals and energy sources; identification of hazards and reporting of incidents and near misses',
    itemMax: 5,
  },
  {
    sectionCode: 'B',
    sectionLabel: 'OCCUPATIONAL HEALTH, SAFETY AND ENVIRONMENT',
    sectionMax: 15,
    itemCode: '5',
    itemLabel:
      'Housekeeping, waste segregation and disposal, and compliance with the environmental requirements of the industry',
    itemMax: 5,
  },

  // C · INTERPRETATION OF TECHNICAL INFORMATION AND JOB PREPARATION (10)
  {
    sectionCode: 'C',
    sectionLabel: 'INTERPRETATION OF TECHNICAL INFORMATION AND JOB PREPARATION',
    sectionMax: 10,
    itemCode: '6',
    itemLabel:
      'Interpretation of engineering drawings, sketches, specifications, manuals, job cards and work instructions',
    itemMax: 5,
  },
  {
    sectionCode: 'C',
    sectionLabel: 'INTERPRETATION OF TECHNICAL INFORMATION AND JOB PREPARATION',
    sectionMax: 10,
    itemCode: '7',
    itemLabel:
      'Selection of the correct materials, tools, equipment and process for the job, and their proper handling and storage',
    itemMax: 5,
  },

  // D · INDUSTRIAL OPERATIONS AND WORKMANSHIP (15)
  {
    sectionCode: 'D',
    sectionLabel: 'INDUSTRIAL OPERATIONS AND WORKMANSHIP',
    sectionMax: 15,
    itemCode: '8',
    itemLabel:
      'Setting up, adjusting, operating and controlling machines, equipment, plant and processes',
    itemMax: 5,
  },
  {
    sectionCode: 'D',
    sectionLabel: 'INDUSTRIAL OPERATIONS AND WORKMANSHIP',
    sectionMax: 15,
    itemCode: '9',
    itemLabel:
      'Execution of the occupational operations in the correct sequence and in accordance with the industrial procedure',
    itemMax: 5,
  },
  {
    sectionCode: 'D',
    sectionLabel: 'INDUSTRIAL OPERATIONS AND WORKMANSHIP',
    sectionMax: 15,
    itemCode: '10',
    itemLabel:
      'Accuracy of measurement and marking out, and the quality, finish and durability of the completed work against the industrial standard',
    itemMax: 5,
  },

  // E · MAINTENANCE, TESTING AND QUALITY ASSURANCE (10)
  {
    sectionCode: 'E',
    sectionLabel: 'MAINTENANCE, TESTING AND QUALITY ASSURANCE',
    sectionMax: 10,
    itemCode: '11',
    itemLabel:
      'Servicing, preventive and corrective maintenance of tools, equipment, machines and installations',
    itemMax: 5,
  },
  {
    sectionCode: 'E',
    sectionLabel: 'MAINTENANCE, TESTING AND QUALITY ASSURANCE',
    sectionMax: 10,
    itemCode: '12',
    itemLabel:
      'Testing, inspection, fault diagnosis and corrective action against the industrial quality standard',
    itemMax: 5,
  },

  // F · PRODUCTIVITY, TECHNOLOGY AND INDUSTRIAL RECORDS (10)
  {
    sectionCode: 'F',
    sectionLabel: 'PRODUCTIVITY, TECHNOLOGY AND INDUSTRIAL RECORDS',
    sectionMax: 10,
    itemCode: '13',
    itemLabel:
      'Productivity: economical use of time, materials, energy and consumables, and application of current industrial technology, methods and standards',
    itemMax: 5,
  },
  {
    sectionCode: 'F',
    sectionLabel: 'PRODUCTIVITY, TECHNOLOGY AND INDUSTRIAL RECORDS',
    sectionMax: 10,
    itemCode: '14',
    itemLabel:
      'Keeping of industrial records — job cards, readings, test results and the daily logbook — and clear reporting to the Industrial Supervisor',
    itemMax: 5,
  },
];
