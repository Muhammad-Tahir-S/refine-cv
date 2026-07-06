# Synced Cursor assets

Skills, commands, and rules in this folder are **generated** by `pnpm setup` from canonical copies in `packs/<name>/cursor/`.

Do not edit **pack-owned** files here (anything listed in `packs.json`) — they are overwritten on the next setup sync. Edit the source in `packs/` instead, then run:

```bash
pnpm setup --yes
```

Or add/remove packs:

```bash
pnpm setup --add toptal
pnpm setup --remove toptal
```

Files you create here yourself (not listed in `packs.json`) are preserved across syncs.
