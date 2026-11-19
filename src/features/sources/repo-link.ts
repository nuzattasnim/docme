/**
 * Repo link input rules (SPEC3 §6.1): parse and normalize a GitHub
 * repository URL, and validate branch, docs path and commit SHA.
 *
 * Pure functions, no I/O. Every rule runs before a request is sent (C1).
 */

export interface RepoLinkInput {
  repoUrl: string;
  branch: string;
  docsPath: string;
  baselineCommitSha: string;
}

export interface NormalizedRepoLink {
  Provider: "GitHub";
  RepoOwner: string;
  RepoName: string;
  RepoUrl: string;
  Branch: string;
  DocsPath: string;
  BaselineCommitSha: string | null;
}

export type RepoLinkField = keyof RepoLinkInput;
export type RepoLinkErrors = Partial<Record<RepoLinkField, string>>;

export const REPO_LINK_MESSAGES = {
  repoRequired: "Enter the repository URL",
  notGitHub: "Only github.com repositories are supported for now",
  badRepo: "Enter a repository URL like https://github.com/owner/repo",
  branchRequired: "Enter a branch",
  badBranch: "Branch name is not valid",
  badPath: "Docs path must start with / and can't contain ..",
  pathTooLong: "Docs path is limited to 500 characters",
  badSha: "Enter the full 40-character commit SHA",
} as const;

const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
  /** From a `/tree/<branch>` URL, when present. */
  branch?: string;
}

export type ParseResult = { ok: true; value: ParsedRepoUrl } | { ok: false; error: string };

/**
 * Accepts `https://github.com/o/r`, `…/r.git`, `…/r/`, `…/r/tree/<branch>`
 * and `git@github.com:o/r.git`. Any other host is refused.
 */
export function parseRepoUrl(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: REPO_LINK_MESSAGES.repoRequired };

  let host: string;
  let path: string;
  const ssh = /^git@([^:/\s]+):(.+)$/.exec(input);
  if (ssh) {
    host = ssh[1];
    path = ssh[2];
  } else {
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
      return { ok: false, error: REPO_LINK_MESSAGES.badRepo };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, error: REPO_LINK_MESSAGES.notGitHub };
    }
    if (url.username || url.password || url.port) return { ok: false, error: REPO_LINK_MESSAGES.badRepo };
    host = url.hostname;
    path = url.pathname;
  }

  host = host.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return { ok: false, error: REPO_LINK_MESSAGES.notGitHub };
  }

  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length < 2) return { ok: false, error: REPO_LINK_MESSAGES.badRepo };
  const owner = segments[0];
  let repo = segments[1];
  if (repo.toLowerCase().endsWith(".git")) repo = repo.slice(0, -4);
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") {
    return { ok: false, error: REPO_LINK_MESSAGES.badRepo };
  }

  let branch: string | undefined;
  const rest = segments.slice(2);
  if (rest.length > 0) {
    // Only `/tree/<branch>` is meaningful; a branch may contain slashes.
    if (ssh || rest[0] !== "tree" || rest.length < 2) {
      return { ok: false, error: REPO_LINK_MESSAGES.badRepo };
    }
    try {
      branch = rest.slice(1).map(decodeURIComponent).join("/");
    } catch {
      return { ok: false, error: REPO_LINK_MESSAGES.badRepo };
    }
  }
  return { ok: true, value: { owner, repo, branch } };
}

export function canonicalRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}

/** `git check-ref-format` rules for a branch name (SPEC3 §6.1). */
export function isValidBranch(branch: string): boolean {
  if (branch.length < 1 || branch.length > 255) return false;
  // Space, control characters (incl. DEL), and the characters git forbids.
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f\x7f~^:?*[\\]/.test(branch)) return false;
  if (branch.includes("..") || branch.includes("@{") || branch.includes("//")) return false;
  if (branch === "@") return false;
  if (/^[/.]|[/.]$/.test(branch)) return false;
  if (branch.endsWith(".lock")) return false;
  // No path component may start with "." or end with ".lock".
  if (branch.split("/").some((c) => c.startsWith(".") || c.endsWith(".lock"))) return false;
  return true;
}

export function validateDocsPath(path: string): string | null {
  if (!path.startsWith("/") || path.split("/").some((seg) => seg === "..")) {
    return REPO_LINK_MESSAGES.badPath;
  }
  if (path.length > 500) return REPO_LINK_MESSAGES.pathTooLong;
  return null;
}

/**
 * Validate every field and build the record to store. Returns per-field
 * errors when anything is invalid; nothing is sent in that case.
 */
export function normalizeRepoLink(
  input: RepoLinkInput,
): { ok: true; value: NormalizedRepoLink } | { ok: false; errors: RepoLinkErrors } {
  const errors: RepoLinkErrors = {};

  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed.ok) errors.repoUrl = parsed.error;

  let branch = input.branch.trim();
  if (!branch && parsed.ok && parsed.value.branch) branch = parsed.value.branch;
  if (!branch) errors.branch = REPO_LINK_MESSAGES.branchRequired;
  else if (!isValidBranch(branch)) errors.branch = REPO_LINK_MESSAGES.badBranch;

  const docsPath = input.docsPath.trim() || "/";
  const pathError = validateDocsPath(docsPath);
  if (pathError) errors.docsPath = pathError;

  const sha = input.baselineCommitSha.trim().toLowerCase();
  if (sha && !SHA_RE.test(sha)) errors.baselineCommitSha = REPO_LINK_MESSAGES.badSha;

  if (!parsed.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  const { owner, repo } = parsed.value;
  return {
    ok: true,
    value: {
      Provider: "GitHub",
      RepoOwner: owner,
      RepoName: repo,
      RepoUrl: canonicalRepoUrl(owner, repo),
      Branch: branch,
      DocsPath: docsPath,
      BaselineCommitSha: sha || null,
    },
  };
}

/** First 7 characters, for display. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}
