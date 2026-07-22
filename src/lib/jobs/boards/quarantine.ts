export type QuarantineCategory =
  | "metadata"
  | "missing_fields"
  | "malformed"
  | "low_quality"
  | "unsupported";

export interface QuarantineSample {
  index: number;
  identifier?: string;
  title?: string;
}

export interface QuarantineDiagnostics {
  total: number;
  byReason: Record<string, number>;
  byCategory: Record<QuarantineCategory, number>;
  samples: QuarantineSample[];
}

const MAX_SAMPLES = 5;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireArrayField(
  value: unknown,
  field: string,
  provider: string,
): unknown[] {
  if (!isRecord(value) || !Array.isArray(value[field])) {
    throw new Error(
      `${provider} response must be an object with a "${field}" array`,
    );
  }
  return value[field];
}

export function safeRecordSample(
  value: unknown,
  identifierKeys: string[],
  titleKeys: string[],
): Omit<QuarantineSample, "index"> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const identifier = identifierKeys
    .map((key) => value[key])
    .find((entry) => typeof entry === "string" || typeof entry === "number");
  const title = titleKeys
    .map((key) => value[key])
    .find((entry) => typeof entry === "string");

  return {
    identifier: identifier === undefined ? undefined : String(identifier),
    title: typeof title === "string" ? title : undefined,
  };
}

export class QuarantineCollector {
  private total = 0;
  private byReason = new Map<string, number>();
  private byCategory = new Map<QuarantineCategory, number>();
  private samples: QuarantineSample[] = [];

  record(
    reason: string,
    category: QuarantineCategory,
    sample?: Omit<QuarantineSample, "index">,
    index?: number,
  ): void {
    this.total += 1;
    this.byReason.set(reason, (this.byReason.get(reason) ?? 0) + 1);
    this.byCategory.set(category, (this.byCategory.get(category) ?? 0) + 1);

    if (this.samples.length >= MAX_SAMPLES || !sample) {
      return;
    }

    this.samples.push({
      index: index ?? this.total - 1,
      identifier: truncate(sample.identifier, 120),
      title: truncate(sample.title, 120),
    });
  }

  toDiagnostics(): QuarantineDiagnostics {
    return {
      total: this.total,
      byReason: Object.fromEntries(this.byReason),
      byCategory: Object.fromEntries(this.byCategory) as Record<QuarantineCategory, number>,
      samples: this.samples,
    };
  }
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function emptyQuarantineDiagnostics(): QuarantineDiagnostics {
  return {
    total: 0,
    byReason: {},
    byCategory: {} as Record<QuarantineCategory, number>,
    samples: [],
  };
}
