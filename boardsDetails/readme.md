# boardsDetails

Research-trail notes for the board-variant pin audit process described in
`project_board_variant_pin_audit_playbook.md` (re-auditing an existing chip
family) and `newChipFamilyAI-guide.md` (bringing in a brand new one).

This directory is **not** read or written by `build_boards.js`, or by any
other part of the pfodWeb build — it isn't part of the automated build
process at all. It exists purely as a human/AI-maintained record: evidence
and reasoning captured while auditing each board, kept alongside the code
for later review rather than only living in a session transcript.

## Layout

```
boardsDetails/<family>/<chip>/<board>/notes.txt
```

One `notes.txt` per board, written during that board's audit pass. Each
file documents the pin-exclusion decisions made for that specific board —
what dedicated hardware (SD card, radio module, display, sensor bus, etc.)
was found wired to which GPIOs, what evidence was used (vendor schematics,
`pins_arduino.h`/`variant.h`, pinout diagrams, bootloader source), and why
a pin was excluded, kept, or a prior decision was later reversed.

See `project_board_variant_pin_audit_playbook.md` for the full audit
procedure these notes are produced by.
