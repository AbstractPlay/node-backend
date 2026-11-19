import disposableDomainsJson from './disposableEmailDomains.json';

/** Minimum time on register form before SignUp (soft timing). */
export const MIN_REGISTER_MS = 1500;

const MAX_REGISTER_MS = 60 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;
const MAX_EMAIL_LEN = 254;

export const ALLOW_PROVIDER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'yahoo.co.uk',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'aol.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'fastmail.com',
  'fastmail.fm',
]);

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'abstractplay',
  'support',
  'help',
  'mod',
  'moderator',
  'root',
  'system',
  'noreply',
  'postmaster',
]);

export type PreSignUpTriggerEvent = {
  version?: string;
  triggerSource: string;
  region?: string;
  userPoolId?: string;
  userName: string;
  request: {
    userAttributes: Record<string, string>;
    validationData?: Record<string, string>;
    clientMetadata?: Record<string, string>;
  };
  response?: {
    autoConfirmUser?: boolean;
    autoVerifyEmail?: boolean;
    autoVerifyPhone?: boolean;
  };
};

export type PreSignUpRejectedCode =
  | 'EmailRequired'
  | 'EmailSyntax'
  | 'EmailNotAllowed'
  | 'Honeypot'
  | 'EmailConfirm'
  | 'Timing'
  | 'DuplicateEmail'
  | 'ReservedUsername'
  | 'UsernameRequired';

export class PreSignUpRejected extends Error {
  readonly code: PreSignUpRejectedCode;

  constructor(code: PreSignUpRejectedCode, message?: string) {
    const text = message ?? `PreSignUpRejected:${code}`;
    super(text);
    this.name = 'PreSignUpRejected';
    this.code = code;
  }
}

export function preSignUpRejectedMessage(code: PreSignUpRejectedCode): string {
  return `PreSignUpRejected:${code}`;
}

export interface PreSignUpDeps {
  now?: () => number;
  disposableDomains?: ReadonlySet<string>;
  emailInUse?: (normalizedEmail: string) => Promise<boolean>;
}

const DEFAULT_DISPOSABLE = new Set(
  (disposableDomainsJson as string[]).map((d) => d.toLowerCase()),
);

function registrableDomain(host: string): string {
  const parts = host.toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) {
    return host.toLowerCase();
  }
  return `${parts[parts.length - 2]!}.${parts[parts.length - 1]!}`;
}

/** Trim; lowercase domain; keep local-part casing. */
export function normalizeEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    return trimmed;
  }
  const local = trimmed.slice(0, at).trim();
  const domain = trimmed.slice(at + 1).trim().toLowerCase();
  return `${local}@${domain}`;
}

export function emailsMatchForSignUp(a: string, b: string): boolean {
  return normalizeEmailAddress(a).toLowerCase() === normalizeEmailAddress(b).toLowerCase();
}

function isPlausibleEmail(raw: string): boolean {
  if (raw.length > MAX_EMAIL_LEN || /\s/.test(raw)) {
    return false;
  }
  const at = raw.indexOf('@');
  if (at <= 0 || at === raw.length - 1) {
    return false;
  }
  const host = raw.slice(at + 1);
  if (!host.includes('.')) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function isThrowawayDomain(domain: string, disposable: ReadonlySet<string>): boolean {
  const registrable = registrableDomain(domain);
  if (ALLOW_PROVIDER_DOMAINS.has(registrable)) {
    return false;
  }
  return disposable.has(registrable);
}

function assertClientMetadata(
  metadata: Record<string, string> | undefined,
  now: number,
): void {
  if (!metadata || typeof metadata.website !== 'string') {
    throw new PreSignUpRejected('Honeypot');
  }
  if (metadata.website.trim() !== '') {
    throw new PreSignUpRejected('Honeypot');
  }
  if (typeof metadata.emailConfirm !== 'string' || metadata.emailConfirm.trim() === '') {
    throw new PreSignUpRejected('EmailConfirm');
  }
  const startedRaw = metadata.formStartedAt;
  if (startedRaw === undefined || startedRaw === '') {
    throw new PreSignUpRejected('Timing');
  }
  const started = Number(startedRaw);
  if (!Number.isFinite(started)) {
    throw new PreSignUpRejected('Timing');
  }
  const elapsed = now - started;
  if (elapsed < MIN_REGISTER_MS) {
    throw new PreSignUpRejected('Timing');
  }
  if (elapsed > MAX_REGISTER_MS || elapsed < -FUTURE_SKEW_MS) {
    throw new PreSignUpRejected('Timing');
  }
}

export async function applyPreSignUpChecks(
  event: PreSignUpTriggerEvent,
  deps: PreSignUpDeps = {},
): Promise<PreSignUpTriggerEvent> {
  const now = deps.now?.() ?? Date.now();
  const disposable = deps.disposableDomains ?? DEFAULT_DISPOSABLE;
  const isAdmin = event.triggerSource === 'PreSignUp_AdminCreateUser';

  const rawEmail = event.request.userAttributes.email;
  if (!rawEmail?.trim()) {
    throw new PreSignUpRejected('EmailRequired');
  }
  const email = normalizeEmailAddress(rawEmail);
  if (!isPlausibleEmail(email)) {
    throw new PreSignUpRejected('EmailSyntax');
  }
  const domain = email.slice(email.indexOf('@') + 1);
  if (isThrowawayDomain(domain, disposable)) {
    throw new PreSignUpRejected('EmailNotAllowed');
  }

  if (!isAdmin) {
    assertClientMetadata(event.request.clientMetadata, now);
    const confirm = event.request.clientMetadata!.emailConfirm;
    if (!emailsMatchForSignUp(confirm, email)) {
      throw new PreSignUpRejected('EmailConfirm');
    }
  }

  const loginName = (event.userName ?? '').trim();
  if (!loginName) {
    throw new PreSignUpRejected('UsernameRequired');
  }
  if (RESERVED_USERNAMES.has(loginName.toLowerCase())) {
    throw new PreSignUpRejected('ReservedUsername');
  }

  if (deps.emailInUse) {
    const inUse = await deps.emailInUse(email);
    if (inUse) {
      throw new PreSignUpRejected('DuplicateEmail');
    }
  }

  return event;
}

export function loadDisposableEmailDomains(): ReadonlySet<string> {
  return DEFAULT_DISPOSABLE;
}