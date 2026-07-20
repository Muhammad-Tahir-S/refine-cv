#!/usr/bin/env node
import { paths } from "../lib/paths.js";
import { saveMergedAppliedFromReports } from "../lib/jobs/state.js";

const merged = saveMergedAppliedFromReports(paths.jobsDir);
console.log(
  `Applied jobs synced: ${Object.keys(merged.applied).length} applied, ${Object.keys(merged.dismissed).length} dismissed, ${Object.keys(merged.expired).length} expired`,
);
