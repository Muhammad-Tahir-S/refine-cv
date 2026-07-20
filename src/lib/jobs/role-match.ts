import type { RoleProfile } from "./role-profile.js";

const REACT_TITLE_PATTERNS = [
  /\bfrontend\b/i,
  /\bfront-end\b/i,
  /\bfront end\b/i,
  /\breact\b/i,
  /\bnext\.?js\b/i,
  /\bweb engineer\b/i,
  /\bweb developer\b/i,
  /\bui engineer\b/i,
  /\bproduct engineer\b/i,
  /\bdesign engineer\b/i,
  /\bjavascript engineer\b/i,
  /\btypescript engineer\b/i,
  /\bgrowth engineer\b/i,
  /\bfull[- ]stack\b/i,
  /\bfullstack\b/i,
];

const REACT_TITLE_EXCLUDE = [
  /\bengineering manager\b/i,
  /\bmanager\b/i,
  /\bdirector\b/i,
  /\bcustomer success\b/i,
  /\bsales\b/i,
  /\bsdr\b/i,
  /\bsupport engineer\b/i,
  /\bsustaining\b/i,
  /\boperations engineer\b/i,
  /\bdelivery lead\b/i,
  /\brecruiter\b/i,
  /\baccount executive\b/i,
  /\btechnical author\b/i,
  /\bgolang\b/i,
  /\bpython engineer\b/i,
  /\brust engineer\b/i,
  /\bopenstack\b/i,
  /\bcloud engineering\b/i,
  /\bbackend engineer\b/i,
  /\bplatform engineer\b/i,
  /\bdevops\b/i,
  /\bsre\b/i,
  /\bobservability\b/i,
];

const REACT_DESCRIPTION_PATTERNS = [
  /\breact\b/i,
  /\bnext\.?js\b/i,
  /\breact\.js\b/i,
];

const REACT_EXCLUDE_STACK = ["angular", "vue 3", "vue.js"];

const NODEJS_EXPLICIT_TITLE_PATTERNS = [
  /\bnode\.?js\b/i,
  /\bnestjs\b/i,
  /\bexpress\b/i,
];

const NODEJS_GENERIC_TITLE_PATTERNS = [
  /\bbackend engineer\b/i,
  /\bback-end engineer\b/i,
  /\bback end engineer\b/i,
  /\bserver[- ]side\b/i,
  /\bapi engineer\b/i,
  /\bbackend developer\b/i,
  /\bback-end developer\b/i,
  /\bsoftware engineer\b/i,
];

const NODEJS_TITLE_EXCLUDE = [
  /\bfrontend engineer\b/i,
  /\bfront-end engineer\b/i,
  /\bfront end engineer\b/i,
  /\breact engineer\b/i,
  /\bui engineer\b/i,
  /\bux engineer\b/i,
  /\bengineering manager\b/i,
  /\bdirector\b/i,
  /\bcustomer success\b/i,
  /\bsales\b/i,
  /\bsupport engineer\b/i,
  /\bgolang\b/i,
  /\bgo engineer\b/i,
  /\bpython engineer\b/i,
  /\brust engineer\b/i,
  /\bjava engineer\b/i,
  /\bkotlin engineer\b/i,
  /\bscala engineer\b/i,
  /\bphp engineer\b/i,
  /\bruby engineer\b/i,
  /\bdevops\b/i,
  /\bsre\b/i,
];

const NODEJS_SIGNAL_PATTERNS = [
  /\bnode\.?js\b/i,
  /\bnestjs\b/i,
  /\bexpress\b/i,
];

function reactTitleExcluded(title: string): boolean {
  if (REACT_TITLE_EXCLUDE.some((pattern) => pattern.test(title))) {
    const rescue =
      REACT_TITLE_PATTERNS.some((pattern) => pattern.test(title)) &&
      /\b(frontend|react|web ui|design engineer)\b/i.test(title);
    return !rescue;
  }
  return false;
}

function nodejsTitleExcluded(title: string): boolean {
  if (NODEJS_TITLE_EXCLUDE.some((pattern) => pattern.test(title))) {
    const rescue = NODEJS_EXPLICIT_TITLE_PATTERNS.some((pattern) =>
      pattern.test(title),
    );
    return !rescue;
  }
  return false;
}

function matchesReactFrontend(title: string, description: string): boolean {
  if (reactTitleExcluded(title)) {
    return false;
  }

  const titleMatch = REACT_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  if (titleMatch) {
    const titleLower = title.toLowerCase();
    const excludePrimary =
      REACT_EXCLUDE_STACK.some((stack) => titleLower.includes(stack)) &&
      !titleLower.includes("react");
    return !excludePrimary;
  }

  const descriptionSnippet = description.slice(0, 2500);
  const reactInDescription = REACT_DESCRIPTION_PATTERNS.some((pattern) =>
    pattern.test(descriptionSnippet),
  );
  const softwareEngineerTitle = /\bsoftware engineer\b/i.test(title);

  return softwareEngineerTitle && reactInDescription;
}

function matchesNodejsBackend(title: string, description: string): boolean {
  if (nodejsTitleExcluded(title)) {
    return false;
  }

  if (NODEJS_EXPLICIT_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return true;
  }

  const descriptionSnippet = description.slice(0, 2500);
  const hasGenericBackendTitle = NODEJS_GENERIC_TITLE_PATTERNS.some((pattern) =>
    pattern.test(title),
  );
  const hasNodeSignal = NODEJS_SIGNAL_PATTERNS.some((pattern) =>
    pattern.test(`${title}\n${descriptionSnippet}`),
  );

  return hasGenericBackendTitle && hasNodeSignal;
}

export function matchesRoleProfile(
  title: string,
  description: string,
  profile: RoleProfile,
): boolean {
  if (profile === "nodejsBackend") {
    return matchesNodejsBackend(title, description);
  }
  return matchesReactFrontend(title, description);
}

export function roleMismatchReason(profile: RoleProfile): string {
  return profile === "nodejsBackend"
    ? "Not Node.js/backend focused"
    : "Not React/frontend focused";
}
