/**
 * The auto-comment phrase bank, ported verbatim from the prototype's `ADVICE`
 * table (reference/Tathmini.dc.html) — 89 sentences, one per criterion across
 * all three instruments.
 *
 * Static and versioned on purpose. CONTEXT.md's seventh non-negotiable: "No
 * language model in the marking path. Auto-comment advice is a static,
 * versioned phrase bank so the Academic Board can review it and it works
 * offline." Every sentence here is reviewable as text and ships with the app,
 * so a supervisor in a workshop with no signal gets the same suggestions as
 * one in the office.
 *
 * The register is imperative and practical, and never a grade-word — the VETA
 * forms explicitly forbid comments like "excellent", "very good" or "fair".
 *
 * Keyed by `instrumentCode:sectionCode:itemCode`, which is the criteria
 * table's own verbatim numbering (`tp_theory:1:i`). The prototype keyed on its
 * own ids (`t1a`) and numbered items within each section; those were mapped by
 * position, and all 89 matched with none left over.
 */
export const CRITERION_ADVICE: Readonly<Record<string, string>> = {
  // ── TP Theory ─────────────────────────────────────
  'tp_theory:1:i': 'Prepare your scheme of work and lesson plan before the lesson, and have both with you in class.',
  'tp_theory:1:ii': 'Write objectives that can be measured. Say what the trainee will be able to do by the end, and name the competence.',
  'tp_theory:1:iii': 'Arrange the parts of your lesson plan in the proper order — introduction, development, activities, assessment, conclusion.',
  'tp_theory:1:iv': 'Make each stage of the lesson and each assessment activity match the specific objective it is meant to achieve.',
  'tp_theory:1:v': 'Write the safety requirements of the lesson into your plan, and remind the trainees of them.',
  'tp_theory:1:vi': 'Choose your teaching aids in advance and prepare them before the lesson begins.',
  'tp_theory:1:vii': 'Keep your students records complete and up to date — attendance, marks and progress.',
  'tp_theory:2:i': 'Begin with recall questions so you know what the trainees already understand before you teach new content.',
  'tp_theory:2:ii': 'Study the subject matter more deeply before teaching it. Confidence in class comes from mastery of the content.',
  'tp_theory:2:iii': 'Present the content step by step, from what is simple and known to what is new and difficult.',
  'tp_theory:2:iv': 'Use examples from the local environment and the trade the trainees will work in.',
  'tp_theory:2:v': 'Spread your questions around the class, and use what trainees answer — correct wrong answers with respect.',
  'tp_theory:2:vi': 'Emphasise the safety measures of the topic every time you teach it. Safety is taught, not assumed.',
  'tp_theory:3:i': 'Choose teaching methods that suit your objectives and content, not the same method for every lesson.',
  'tp_theory:3:ii': 'Apply the method you selected properly. Prepare the steps it requires before the lesson.',
  'tp_theory:3:iii': 'Check whether the method is working during the lesson, and change it if the trainees are not following.',
  'tp_theory:3:iv': 'Involve every trainee, not only those who raise their hands. Use group work and direct questions.',
  'tp_theory:4:i': 'Bring your teaching aids into the class. An aid left in the office teaches nobody.',
  'tp_theory:4:ii': 'Use aids that match the specific objectives of the lesson.',
  'tp_theory:4:iii': 'Make your aids large enough, neat and clearly visible from the back of the class.',
  'tp_theory:4:iv': 'Be creative — improvise aids from local materials where the college has none.',
  'tp_theory:4:v': 'Practise using your aids before the lesson so you handle them confidently in class.',
  'tp_theory:5:i': 'Speak with confidence, clearly and at a steady pace, using correct language.',
  'tp_theory:5:ii': 'Raise your voice so that the trainees at the back of the class hear you well.',
  'tp_theory:5:iii': 'Explain in a logical order, and use simple examples when trainees do not understand.',
  'tp_theory:6:i': 'Write on the board neatly and large enough to be read from the back of the class.',
  'tp_theory:6:ii': 'Arrange your board work in sections and keep it in order as the lesson proceeds.',
  'tp_theory:6:iii': 'Stand to the side while explaining so that you do not block what you have written.',
  'tp_theory:7:i': 'Give trainees enough activities, of good quality and suited to their level.',
  'tp_theory:7:ii': 'Make sure each activity leads to a specific objective of the lesson.',
  'tp_theory:7:iii': 'Relate the activities to what the trainees meet in daily life and at work.',
  'tp_theory:8:i': 'Manage the class firmly and fairly, and keep discipline throughout the lesson.',
  'tp_theory:8:ii': 'Deal with problems as they arise in the lesson without losing control of the class.',
  'tp_theory:8:iii': 'Organise the classroom — seating, movement and grouping — before the lesson starts.',
  'tp_theory:9:i': 'Speak to learners gently and use appropriate language at all times.',
  'tp_theory:9:ii': 'Dress neatly and professionally, as a teacher of this trade should.',
  'tp_theory:9:iii': 'Keep your body and appearance clean and presentable.',
  'tp_theory:9:iv': 'Draw and hold the attention of the class through your voice, movement and eye contact.',
  'tp_theory:10:i': 'Reflect honestly on your own lesson — say which objectives were achieved and which were not, and why.',
  'tp_theory:10:ii': 'Propose clear, realistic strategies for improving your next lesson.',
  'tp_theory:10:iii': 'Receive the advice of the examiner openly and act on it in your next lesson.',
  // ── TP Practical ──────────────────────────────────
  'tp_practical:1:i': 'Prepare your scheme of training and keep it available at the workshop.',
  'tp_practical:1:ii': 'Prepare a written practical lesson plan for every session.',
  'tp_practical:1:iii': 'Set clear learning objectives that state the skill the trainee must perform.',
  'tp_practical:1:iv': 'Prepare a task that suits the objectives, the level of the trainees and the time available.',
  'tp_practical:1:v': 'Plan the safety requirements of the task before the session, and provide the protective equipment needed.',
  'tp_practical:1:vi': 'Select training materials and aids that suit the nature of the task and the level of the trainees.',
  'tp_practical:1:vii': 'Select and check the tools, machines and equipment before the session begins.',
  'tp_practical:1:viii': 'Include environmental care in your occupational practice — waste, materials and energy.',
  'tp_practical:1:ix': 'Prepare an information sheet for the task and give it to the trainees.',
  'tp_practical:1:x': 'Prepare an assessment sheet with clear criteria before the trainees begin the task.',
  'tp_practical:1:xi': 'Set a target time for the task and make it known to the trainees.',
  'tp_practical:1:xii': 'Organise the trainees in groups suited to the task and the equipment available.',
  'tp_practical:2:i': 'Arrange the workshop for the task, and observe the safety requirements in that arrangement.',
  'tp_practical:2:ii': 'Explain the task clearly and emphasise its key elements before work begins.',
  'tp_practical:2:iii': 'Use the required materials correctly, and show the trainees how they are handled.',
  'tp_practical:2:iv': 'Demonstrate the operation clearly, step by step, where every trainee can see.',
  'tp_practical:2:v': 'Practise the operation yourself until you can perform it competently. The trainees copy what you do.',
  'tp_practical:2:vi': 'Let every trainee perform the task, and correct their mistakes at the moment they happen.',
  'tp_practical:2:vii': 'Emphasise safety measures throughout the session, not only at the beginning.',
  'tp_practical:2:viii': 'Link the practical work to the underlying knowledge by asking oral questions during the task.',
  'tp_practical:2:ix': 'Relate the task to the local working environment and industry practice.',
  'tp_practical:2:x': 'Question the trainees during the work and handle their answers constructively.',
  'tp_practical:3:i': 'Assess the process as the trainee works, and check that safety measures are observed.',
  'tp_practical:3:ii': 'Assess the finished product against the set standards and criteria.',
  'tp_practical:3:iii': 'Check the knowledge behind the skill through oral questioning at the workstation.',
  'tp_practical:3:iv': 'Monitor and record the progress of each trainee as the session proceeds.',
  'tp_practical:3:v': 'Ensure the work area is cleaned and the tools and equipment are stored as required.',
  'tp_practical:4:i': 'Speak with confidence and clarity so instructions cannot be misunderstood.',
  'tp_practical:4:ii': 'Raise your voice above the workshop noise so all trainees hear the instruction.',
  'tp_practical:4:iii': 'Explain the items and steps in a logical order.',
  'tp_practical:5:i': 'Speak to the learners gently and use appropriate language in the workshop.',
  'tp_practical:5:ii': 'Dress neatly and wear the proper protective clothing for the trade.',
  'tp_practical:5:iii': 'Teach the trainees the ethics of the occupation, not only its skills.',
  'tp_practical:5:iv': 'Be a model of good occupational practice — the trainees will work as you work.',
  // ── IPT ───────────────────────────────────────────
  'ipt:A:1': 'Attend on all working days, arrive on time, and follow the rules and chain of command of the industry.',
  'ipt:A:2': 'Plan your own work and prepare your workstation before starting a job. Keep good working relations with supervisors, colleagues and clients.',
  'ipt:B:3': 'Wear the correct protective equipment at all times, and obey the safety rules, warning signs and permit-to-work requirements.',
  'ipt:B:4': 'Handle tools, machines, materials, chemicals and energy sources safely. Identify hazards and report incidents and near misses.',
  'ipt:B:5': 'Keep your work area clean, separate and dispose of waste properly, and follow the environmental requirements of the industry.',
  'ipt:C:6': 'Practise reading drawings, specifications, manuals and job cards until you can work from them without help.',
  'ipt:C:7': 'Select the correct materials, tools, equipment and process for the job, and handle and store them properly.',
  'ipt:D:8': 'Learn to set up, adjust, operate and control the machines and plant of your section correctly.',
  'ipt:D:9': 'Carry out the operations in the correct sequence and according to the industrial procedure.',
  'ipt:D:10': 'Improve the accuracy of your measurement and marking out, and the quality and finish of your completed work.',
  'ipt:E:11': 'Take part in servicing and maintenance of the tools, equipment and machines you use.',
  'ipt:E:12': 'Learn to test, inspect and diagnose faults, and to take corrective action against the industrial quality standard.',
  'ipt:F:13': 'Use time, materials, energy and consumables economically, and learn the current technology and methods of the industry.',
  'ipt:F:14': 'Keep your industrial records — job cards, readings, test results and the daily logbook — and report clearly to your Industrial Supervisor.',
};

export function adviceKey(instrumentCode: string, sectionCode: string, itemCode: string): string {
  return instrumentCode + ':' + sectionCode + ':' + itemCode;
}

/**
 * The suggestion for one criterion. Falls back to the criterion's own wording
 * rather than returning nothing: a criterion added to a form later would
 * otherwise silently offer no advice, and a supervisor would never know a
 * suggestion was missing.
 */
export function adviceFor(
  instrumentCode: string,
  sectionCode: string,
  itemCode: string,
  itemLabel: string,
): string {
  const found = CRITERION_ADVICE[adviceKey(instrumentCode, sectionCode, itemCode)];
  if (found) return found;
  return (
    'Give more attention to this area: ' +
    itemLabel.charAt(0).toLowerCase() +
    itemLabel.slice(1) +
    '.'
  );
}
