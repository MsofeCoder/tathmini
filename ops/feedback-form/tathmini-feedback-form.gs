/**
 * TATHMINI — USER FEEDBACK FORM
 * Morogoro Vocational Teachers Training College
 *
 * Creates the whole feedback form in one run: questions, sections, a linked
 * response spreadsheet, and an e-mail alert to the developers on every
 * submission.
 *
 * Run createTathminiFeedbackForm() ONCE. Running it again creates a SECOND,
 * separate form — it does not update the first. To change wording later, edit
 * the live form in the Forms editor, not this file.
 *
 * WHAT THIS SCRIPT CANNOT DO
 * Google gives no API for a form's theme — the header image, colour and font
 * are not settable from Apps Script or the Forms API. Those four clicks are
 * step 6 of the guide and have to be done by hand, once.
 *
 * Developers: Adamu Msofe (Msofe Coder), Aron Mganyizi (Muga Coder).
 */

// ─────────────────────────────────────────────────────────────────────
// SETTINGS — check these two before running
// ─────────────────────────────────────────────────────────────────────

/**
 * Who receives an e-mail on every response.
 *
 * Taken from the Tathmini git history; correct them if either is wrong, and
 * add the Principal's or Coordinator's address if they should see feedback
 * too. Every address here gets every response, so keep the list short.
 */
const NOTIFY = ['msofecoder@gmail.com', 'aronfranco369@gmail.com'];

/** Appears in the e-mail subject so alerts are easy to filter in Gmail. */
const SUBJECT_TAG = '[Tathmini Feedback]';

const FORM_TITLE = 'Tathmini — Your Feedback / Maoni Yako';

const FORM_INTRO = [
  'MOROGORO VOCATIONAL TEACHERS TRAINING COLLEGE',
  '',
  'Tathmini is the College’s digital assessment system. We are improving it,',
  'and the people who use it know best what needs to change.',
  '',
  'This form takes about three minutes. Only one question is required. You do',
  'not have to give your name — please say what you actually think.',
  '',
  '— — —',
  '',
  'Tathmini ni mfumo wa kidijitali wa upimaji wa Chuo. Tunauboresha, na',
  'wanaotumia mfumo ndio wanaojua kinachopaswa kubadilishwa.',
  '',
  'Fomu hii inachukua takribani dakika tatu. Swali moja tu ni la lazima. Si',
  'lazima kuandika jina lako — tafadhali sema unachofikiri kwa uwazi.',
].join('\n');

const CONFIRMATION = [
  'Thank you. Your feedback has been received and goes straight to the',
  'development team.',
  '',
  'Asante. Maoni yako yamepokelewa na yanakwenda moja kwa moja kwa timu ya',
  'watengenezaji.',
  '',
  'Morogoro Vocational Teachers Training College',
].join('\n');

// ─────────────────────────────────────────────────────────────────────
// MAIN — run this one
// ─────────────────────────────────────────────────────────────────────

function createTathminiFeedbackForm() {
  // Only settings every account type supports. Anything conditional goes
  // through applyOptionalSettings() below — see the note there.
  const form = FormApp.create(FORM_TITLE)
    .setDescription(FORM_INTRO)
    .setConfirmationMessage(CONFIRMATION)
    .setProgressBar(true)
    .setShowLinkToRespondAgain(false)
    .setAcceptingResponses(true);

  applyOptionalSettings(form);

  buildSectionAboutYou(form);
  buildSectionExperience(form);
  buildSectionLookAndFeel(form);
  buildSectionImprovements(form);
  buildSectionContact(form);

  const sheet = attachResponseSheet(form);
  installSubmitNotification(form);

  const summary = [
    '',
    '════════════════════════════════════════════════════',
    ' TATHMINI FEEDBACK FORM — CREATED',
    '════════════════════════════════════════════════════',
    '',
    'SHARE THIS LINK (short, for WhatsApp):',
    '  ' + form.shortenFormUrl(form.getPublishedUrl()),
    '',
    'Full link:',
    '  ' + form.getPublishedUrl(),
    '',
    'EDIT the form (branding, wording):',
    '  ' + form.getEditUrl(),
    '',
    'RESPONSES spreadsheet:',
    '  ' + sheet.getUrl(),
    '',
    'E-mail alerts go to: ' + NOTIFY.join(', '),
    '',
    'NEXT: step 6 of the guide — set the header image and colour by hand.',
    'Google provides no API for a form’s theme.',
    '════════════════════════════════════════════════════',
  ].join('\n');

  Logger.log(summary);
  return summary;
}

/**
 * The settings that some Google accounts refuse.
 *
 * `setRequireLogin` is a Google Workspace feature: on a personal Gmail account
 * it throws "This operation is not supported" and takes the whole run down
 * with it — after `FormApp.create` has already made a form, leaving a
 * half-built one behind. `setLimitOneResponsePerUser` depends on sign-in and
 * behaves the same way, and Google has changed `setCollectEmail` more than
 * once.
 *
 * Every one of them is being set to its DEFAULT here. Nothing is lost when a
 * call is refused, which is why each is attempted on its own and a refusal is
 * logged rather than thrown: the form we want is the form you get either way.
 *
 * The intent, however it is reached: no sign-in and no e-mail capture. The
 * point is honest criticism of the interface, and people soften it when they
 * are named. Contact details are asked for at the end, optionally.
 */
function applyOptionalSettings(form) {
  const settings = [
    [
      'no sign-in required',
      function () {
        form.setRequireLogin(false);
      },
    ],
    [
      'do not collect e-mail addresses',
      function () {
        form.setCollectEmail(false);
      },
    ],
    [
      'allow more than one response per person',
      function () {
        form.setLimitOneResponsePerUser(false);
      },
    ],
    [
      'responses cannot be edited after sending',
      function () {
        form.setAllowResponseEdits(false);
      },
    ],
  ];

  settings.forEach(function (setting) {
    try {
      setting[1]();
    } catch (err) {
      Logger.log('Skipped (already the default for this account type): ' + setting[0]);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// SECTIONS
// ─────────────────────────────────────────────────────────────────────

/**
 * Who is answering, and what they have actually touched.
 *
 * This is the only part that is not about opinions, and it earns its place:
 * "the buttons are too small" from a supervisor marking in a workshop and the
 * same sentence from an administrator at a desk are two different problems.
 */
function buildSectionAboutYou(form) {
  form
    .addPageBreakItem()
    .setTitle('1. About you')
    .setHelpText('Kuhusu wewe — hakuna swali la lazima hapa.');

  form
    .addMultipleChoiceItem()
    .setTitle('Your role')
    .setHelpText('Wadhifa wako')
    .setChoiceValues([
      'Supervisor / Assessor — Msimamizi (mtahini)',
      'Coordinator — Mratibu',
      'System Administrator — Msimamizi Mkuu wa Mfumo',
      'Trainee — Mwanafunzi (mtahiniwa)',
      'College management / VETA — Uongozi wa Chuo / VETA',
      'Other — Nyingine',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form
    .addCheckboxItem()
    .setTitle('Which parts of Tathmini have you used?')
    .setHelpText('Ni sehemu zipi za Tathmini umewahi kutumia? Chagua zote zinazohusika.')
    .setChoiceValues([
      'Marking a trainee — Teaching Practice (TP)',
      'Marking a trainee — Industrial Practical Training (IPT)',
      'Sending or downloading a report — Kutuma au kupakua ripoti',
      'The administration console — Kiongozi cha utawala',
      'The Coordinator dashboard — Dashibodi ya Mratibu',
      'I received a report about myself — Nilipokea ripoti yangu',
    ])
    .showOtherOption(true)
    .setRequired(false);

  form
    .addMultipleChoiceItem()
    .setTitle('How often do you use Tathmini?')
    .setHelpText('Unatumia Tathmini mara ngapi?')
    .setChoiceValues([
      'Every day — Kila siku',
      'A few times a week — Mara chache kwa wiki',
      'About once a week — Takribani mara moja kwa wiki',
      'Rarely, or only once — Mara chache sana au mara moja tu',
    ])
    .setRequired(false);
}

/** Whether the thing works, in the field, on a real day. */
function buildSectionExperience(form) {
  form.addPageBreakItem().setTitle('2. Using the system').setHelpText('Matumizi ya mfumo');

  form
    .addScaleItem()
    .setTitle('Overall, how easy is Tathmini to use?')
    .setHelpText('Kwa ujumla, Tathmini ni rahisi kiasi gani kutumia?')
    .setBounds(1, 5)
    .setLabels('Very difficult — Mgumu sana', 'Very easy — Rahisi sana')
    .setRequired(false);

  form
    .addScaleItem()
    .setTitle('How easy was it to complete one assessment, from start to submit?')
    .setHelpText(
      'Ilikuwa rahisi kiasi gani kukamilisha upimaji mmoja, kuanzia mwanzo hadi kuwasilisha?',
    )
    .setBounds(1, 5)
    .setLabels('Very difficult — Mgumu sana', 'Very easy — Rahisi sana')
    .setRequired(false);

  form
    .addParagraphTextItem()
    .setTitle('Was there anything confusing, or anything that slowed you down?')
    .setHelpText(
      'Je, kuna kitu kilichokuchanganya au kukuchelewesha? Tafadhali eleza ulipokuwa na tatizo.',
    )
    .setRequired(false);

  form
    .addParagraphTextItem()
    .setTitle('Did anything go wrong? Please say what you were doing at the time.')
    .setHelpText(
      'Je, kuna kitu kilichoenda vibaya? Tafadhali eleza ulichokuwa unafanya wakati huo. ' +
        'Hii inatusaidia kupata tatizo haraka.',
    )
    .setRequired(false);

  form
    .addMultipleChoiceItem()
    .setTitle('Have you used Tathmini where there is no network?')
    .setHelpText('Je, umewahi kutumia Tathmini mahali pasipo na mtandao? Hii ni muhimu sana kwetu.')
    .setChoiceValues([
      'Yes, and it worked — Ndiyo, na ilifanya kazi',
      'Yes, but I had problems — Ndiyo, lakini nilipata matatizo',
      'No, I always have network — Hapana, huwa nina mtandao',
    ])
    .setRequired(false);
}

/** The interface itself — read on a phone, in a workshop, in daylight. */
function buildSectionLookAndFeel(form) {
  form
    .addPageBreakItem()
    .setTitle('3. Look and feel')
    .setHelpText('Muonekano na urahisi wa kutumia');

  form
    .addScaleItem()
    .setTitle('Is the text easy to read on your phone?')
    .setHelpText('Je, maandishi yanasomeka vizuri kwenye simu yako?')
    .setBounds(1, 5)
    .setLabels('Hard to read — Ni magumu kusoma', 'Very clear — Yako wazi sana')
    .setRequired(false);

  form
    .addScaleItem()
    .setTitle('Are the buttons and labels clear about what they do?')
    .setHelpText('Je, vitufe na maelezo yako wazi kuhusu yanachofanya?')
    .setBounds(1, 5)
    .setLabels('Not clear — Havijulikani', 'Very clear — Viko wazi sana')
    .setRequired(false);

  form
    .addParagraphTextItem()
    .setTitle('Is anything hard to see, hard to reach with your thumb, or easy to tap by mistake?')
    .setHelpText(
      'Je, kuna kitu kigumu kuona, kigumu kufikia kwa kidole, au ni rahisi kubonyeza kwa bahati mbaya?',
    )
    .setRequired(false);

  form
    .addTextItem()
    .setTitle('Which phone do you use?')
    .setHelpText('Unatumia simu ya aina gani? Mfano: Tecno Spark 10, Samsung A05, iPhone 11.')
    .setRequired(false);
}

/** The reason the form exists. The one required question lives here. */
function buildSectionImprovements(form) {
  form.addPageBreakItem().setTitle('4. What should change').setHelpText('Nini kibadilishwe');

  form
    .addParagraphTextItem()
    .setTitle('If you could change ONE thing about Tathmini, what would it be?')
    .setHelpText(
      'Kama ungeweza kubadilisha kitu KIMOJA kwenye Tathmini, kingekuwa nini? ' +
        'Hili ndilo swali muhimu kuliko yote.',
    )
    .setRequired(true);

  form
    .addParagraphTextItem()
    .setTitle('Is there something you wish the system could do, but it cannot?')
    .setHelpText('Je, kuna kitu unatamani mfumo ungeweza kufanya, lakini hauwezi?')
    .setRequired(false);

  form
    .addParagraphTextItem()
    .setTitle('What works well and should NOT be changed?')
    .setHelpText(
      'Ni kitu gani kinafanya kazi vizuri na kisibadilishwe? ' +
        'Hii inatuzuia kuharibu kilicho kizuri.',
    )
    .setRequired(false);

  form
    .addScaleItem()
    .setTitle('How likely are you to recommend Tathmini to a colleague?')
    .setHelpText('Je, kuna uwezekano gani wa kumshauri mwenzako atumie Tathmini?')
    .setBounds(1, 5)
    .setLabels('Not at all — Hapana kabisa', 'Very likely — Kwa uhakika mkubwa')
    .setRequired(false);
}

/** Optional, and said to be optional twice, because it is. */
function buildSectionContact(form) {
  form
    .addPageBreakItem()
    .setTitle('5. Contact (optional)')
    .setHelpText(
      'Mawasiliano (si lazima). Acha wazi kama unataka kutoa maoni bila kujitambulisha.',
    );

  form
    .addTextItem()
    .setTitle('Your name (optional)')
    .setHelpText('Jina lako (si lazima)')
    .setRequired(false);

  form
    .addTextItem()
    .setTitle('Phone number or e-mail, if you would like a reply (optional)')
    .setHelpText('Namba ya simu au barua pepe, kama ungependa kujibiwa (si lazima)')
    .setRequired(false);
}

// ─────────────────────────────────────────────────────────────────────
// RESPONSES AND ALERTS
// ─────────────────────────────────────────────────────────────────────

/**
 * A spreadsheet is the destination, not just the form's own summary page.
 *
 * The summary cannot be filtered, sorted or handed to somebody who does not
 * own the form. A sheet can — and it is what you will actually work from when
 * you sit down to decide what to build next.
 */
function attachResponseSheet(form) {
  const sheet = SpreadsheetApp.create('Tathmini Feedback — Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  return sheet;
}

/**
 * E-mails every response to the developers as it arrives.
 *
 * An installable trigger, so it runs as you and may send mail. Any trigger
 * this script made before is removed first: re-running would otherwise stack
 * them up and send three copies of every response.
 */
function installSubmitNotification(form) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onTathminiFeedbackSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onTathminiFeedbackSubmit').forForm(form).onFormSubmit().create();
}

/**
 * Runs on every submission. Named in the trigger above — renaming this
 * function without renaming it there silently stops the alerts.
 */
function onTathminiFeedbackSubmit(e) {
  if (!e || !e.response) return;

  const answers = e.response.getItemResponses();
  const rows = answers
    .map(function (item) {
      const value = item.getResponse();
      const text = Array.isArray(value) ? value.join('; ') : String(value);
      if (!text.trim()) return '';
      return (
        '<p style="margin:0 0 14px;">' +
        '<strong style="display:block;color:#0d4a43;font-size:13px;">' +
        escapeHtml(item.getItem().getTitle()) +
        '</strong>' +
        '<span style="font-size:14px;">' +
        escapeHtml(text).replace(/\n/g, '<br>') +
        '</span></p>'
      );
    })
    .filter(function (row) {
      return row !== '';
    })
    .join('');

  const when = Utilities.formatDate(new Date(), 'Africa/Dar_es_Salaam', 'd MMM yyyy, HH:mm');

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:640px;">',
    '<p style="font-size:11px;font-weight:bold;letter-spacing:.7px;color:#0d4a43;margin:0;">',
    'MOROGORO VOCATIONAL TEACHERS TRAINING COLLEGE</p>',
    '<h2 style="margin:4px 0 2px;font-size:17px;color:#14232e;">New Tathmini feedback</h2>',
    '<p style="margin:0 0 18px;color:#5b6b78;font-size:12px;">Received ' + when + ' (EAT)</p>',
    rows,
    '<hr style="border:none;border-top:1px solid #e1e9e6;margin:18px 0;">',
    '<p style="color:#5b6b78;font-size:11.5px;margin:0;">',
    'Sent automatically by the Tathmini feedback form. Reply to the submitter only if they',
    'left contact details above.</p>',
    '</div>',
  ].join('');

  MailApp.sendEmail({
    to: NOTIFY.join(','),
    subject: SUBJECT_TAG + ' New response — ' + when,
    htmlBody: html,
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────
// UTILITIES — run by hand if you need them
// ─────────────────────────────────────────────────────────────────────

/** Sends yourself one test alert without submitting the form. */
function testNotificationEmail() {
  MailApp.sendEmail({
    to: NOTIFY.join(','),
    subject: SUBJECT_TAG + ' Test',
    htmlBody: '<p>If you are reading this, alerts from the Tathmini feedback form are working.</p>',
  });
}

/** Stops the form accepting responses. Reverse with true. */
function setAcceptingResponses(formUrl, accepting) {
  FormApp.openByUrl(formUrl).setAcceptingResponses(accepting);
}
