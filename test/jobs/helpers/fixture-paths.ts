import { join } from "node:path";
import { paths } from "../../../src/lib/paths.ts";

/** Tracked fixtures — tests must not depend on gitignored personal configs. */
export const fixturePaths = {
  jobSearchReact: join(paths.root, "test", "fixtures", "job-search.json"),
  jobSearchNodejsBackend: join(
    paths.root,
    "test",
    "fixtures",
    "job-search-nodejs-backend.json",
  ),
} as const;
