# Toptal official guide copies

**Primary sources (priority 1)** for `/toptal-pitch` and `/enhance-toptal-profile`.

## Bring your own PDFs

Each user provides their own copies of the official Toptal PDF guides. Drop them in [`pdf/`](pdf/):

| Extract | PDF filename |
|---------|--------------|
| [job-application-matching-handbook.md](job-application-matching-handbook.md) | `Job Application Matching Process Handbook for Developers.pdf` |
| [developer-profile-creation-guide.md](developer-profile-creation-guide.md) | `Developer - Profile Creation Guide.pdf` |

Then extract:

```bash
pnpm extract-toptal-guides
```

PDFs are gitignored. Do not commit them to a public repository.

If PDFs are missing, Toptal skills fall back to [toptal-best-practices.md](../toptal-best-practices.md).

## Usage

Agents must load the `.md` extracts first, then [toptal-best-practices.md](../toptal-best-practices.md). Citation IDs live in [toptal-references.json](../toptal-references.json).

**Pitch generation basis:** [job-application-matching-handbook.md](job-application-matching-handbook.md) **§10–12** (application pitches, strong/weak examples).

Re-extract handbook text after PDF updates: `pnpm extract-toptal-guides`
