# Pin-link backfill worksheet

Heuristic match of pin names against guide body text. Pins flagged here
appear as plain text in the body but a matching pin exists in the DB.
Some matches will be false positives on common names; review before
swapping. The fix is to wrap the mention in `[Name](/pins/<slug>)`.

## london (3 candidates)
- **Covent Garden** -> `[Covent Garden](/pins/covent-garden)`
- **Chinatown** -> `[Chinatown](/pins/chinatown)`
- **Tower Hill** -> `[Tower Hill](/pins/tower-hill)`

---

Total: 3 plain-text mentions where a pin link could be wired in.