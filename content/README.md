# Personal-voice content collection

Markdown files in this folder are the personal prose that appears on
each detail page of go.mike-lee.me. The structured facts (population,
hours, admission, etc.) live in Notion or Supabase; this folder is for
"what would I tell a friend about this place."

## Layout

```
content/
  pins/
    <pin-slug>.md
  cities/
    <city-slug>.md
  countries/
    <country-slug>.md
```

The `<slug>` matches the URL slug. So a file at
`content/cities/aegina.md` powers the page at `/cities/aegina`.

If a file doesn't exist for a place, the detail page renders without
the personal-voice section — Wikipedia + structured facts only. Files
are 100% optional.

## File shape

```md
---
indexable: true
---

Solid afternoon side trip from Athens. The temple sits high enough that
you can see the Saronic Gulf laid out underneath you, and the trail up
is short enough that older kids can manage it without complaint.

The flight in from the harbour ferry took about 40 minutes and dropped
us straight into the kind of small-town quiet that disappears the
moment a tour bus lands…
```

The frontmatter at the top is a tiny YAML-ish block bracketed by
`---`. Today there's only one supported key:

| Key         | Type    | Effect                                                  |
| ----------- | ------- | ------------------------------------------------------- |
| `indexable` | boolean | When `true`, the page drops its `noindex` robots header |

The body below the second `---` is plain paragraphs separated by blank
lines. No headings, no bullets, no inline markdown. Single-line breaks
inside a paragraph are folded; double-line breaks start a new paragraph.

## Authoring workflow

1. Open a fresh Claude desktop chat.
2. Paste the system prompt from `/outputs/content-authoring-handoff.md`
   as the first message. (Or run it as a Claude Project so you only
   have to set it up once.)
3. Tell Claude the scope and slug, then dictate or type your notes.
4. Copy the prose Claude returns.
5. In VS Code: `Cmd+N`, paste, save as `content/<scope>/<slug>.md`.
   Add the `indexable: true` frontmatter line at the top if Claude's
   `INDEX:` flag at the bottom of the response was `yes`.
6. `git commit && git push`. Vercel rebuilds; the prose appears on the
   page within a minute.

## Why files instead of a database table

- Full VS Code editing power: spell-check, find/replace, branch + preview deploys for tricky edits.
- Git history is the audit log. No "is the database in sync" question.
- Works offline. Dictate on a flight, push when you land.
- No admin UI to maintain.
- One mental model across all three scopes (pins / cities / countries).

## Indexing

The default for every detail page is `noindex`. Search engines won't
crawl a place page until you mark its content file `indexable: true`.
This keeps the search index focused on places you've actually written
about, not the ~1,300 stub pages.

## Slug discovery

Don't remember the slug? Open the place's detail page in your browser —
the URL ends in the slug. Or grep the database via Supabase / Notion.
