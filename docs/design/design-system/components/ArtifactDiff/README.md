# ArtifactDiff

A line diff between two revisions of a story artifact (plan, snapshot, state), and the highlight that marks changed text in a rendered plan.

Hunk headers name the section. Added and removed lines use `diff-add-*` and `diff-del-*` and keep a + or − sign, so the change does not rely on colour alone. In a rendered plan, wrap text that changed since the last revision in `ah-mark`.
