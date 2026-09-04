-- TP trainees are notified by e-mail, IPT trainees by SMS only — a fact
-- about what the College's own registers capture (the TP register has an
-- e-mail column and no phone column; the IPT register has a phone column
-- and no e-mail column), not an arbitrary product choice. See
-- packages/db/src/schema.ts's comment on `trainees` and MEMORY.md.
--
-- registration_number is deliberately NOT required here — the only IPT
-- source seen so far has no registration-number column at all, even
-- though the printed IPT form has a "Registration/Index No." field. This
-- constraint only encodes the contact-channel rule, not registration
-- completeness.

alter table trainees
  add constraint trainees_track_contact_check
  check (
    (track = 'TP' and email is not null)
    or (track = 'IPT' and phone is not null)
  );
