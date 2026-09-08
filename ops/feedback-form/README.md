# Tathmini feedback form

The College's channel for hearing from the people who use the system: an
anonymous, bilingual Google Form, linked from **Account → Send feedback**
inside the app and shared with supervisors on WhatsApp.

`tathmini-feedback-form.gs` builds the whole thing in one run — questions,
sections, the response spreadsheet, and an e-mail alert to the developers on
every submission.

## Why the script is in this repository

It does not run here, and nothing in the workspace imports it. It is here
because it exists nowhere else that survives a lost laptop, and because the
live form cannot be read back into code: Google gives no export. If the form is
ever deleted or has to be rebuilt in a College Workspace account, this file is
the only record of what it asked and why.

Treat it as the source of the form's **structure**. Once the form is live, its
**wording** is edited in the Forms editor, and this file will drift — that is
expected and acceptable. Do not re-run the script to apply a wording change; it
creates a second, unrelated form.

## Live as of 8 September 2026

|                   |                                                        |
| ----------------- | ------------------------------------------------------ |
| Form (share this) | https://forms.gle/qW29pWr6oqEry7oY8                    |
| Responses         | Google Sheet, linked from the form's own Responses tab |
| Alerts to         | `msofecoder@gmail.com`, `aronfranco369@gmail.com`      |
| Owner             | A personal Google account — see the warning below      |

## To rebuild it

1. [script.google.com](https://script.google.com) → **New project**, signed in
   as the account that should own the form.
2. Paste this file over the `myFunction` stub.
3. Check `NOTIFY` at the top.
4. Run `createTathminiFeedbackForm`, authorise, read the links from the
   execution log.
5. Set the header image, colour and font by hand in the Forms editor. **There
   is no API for a form's theme** — not in Apps Script and not in the Forms
   API. The banner is a generated MVTTC-branded image; Forms will offer a
   matching palette once it is uploaded.
6. Update `FEEDBACK_URL` in `apps/web/src/components/screens/account-screen.tsx`
   if the URL changed, and the link in the WhatsApp announcement.

## Two things to know

**`setRequireLogin` is Workspace-only.** On a personal Gmail account it throws
`This operation is not supported` and takes the run down with it — after
`FormApp.create` has already made an empty form, which then has to be deleted
by hand. That is why the optional settings are attempted one at a time in
`applyOptionalSettings()` and a refusal is logged rather than thrown. Every one
of them sets a default, so nothing is lost when one is skipped.

**The form is owned by an individual, not the College.** Responses belong to
that Google account. If MVTTC has a `@veta.go.tz` Workspace, rebuilding the
form there would keep the feedback with the institution — transferring
ownership later is more awkward than starting in the right place. Recorded here
rather than left as a surprise for whoever inherits this.
