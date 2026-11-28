/**
 * Usernames are public handles shared by every Quzaurban surface (webapp, Mall app,
 * seller portal, admin dashboard). Rules follow the familiar Instagram-style
 * format so they read well after an "@":
 *   - 3–30 characters: lowercase letters, digits, "." and "_"
 *   - must start with a letter or digit, cannot end with "."
 *   - no consecutive dots
 * Usernames are stored lowercase, so uniqueness is case-insensitive.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_]|\.(?!\.)){1,28}[a-z0-9_]$/;

/** Handles that could be mistaken for Quzaurban staff or system routes. */
const RESERVED = new Set([
  'admin', 'administrator', 'quza', 'quzaurban', 'support', 'help', 'staff',
  'team', 'official', 'moderator', 'mod', 'root', 'system', 'security',
  'billing', 'payments', 'mpesa', 'seller', 'sellers', 'buyer', 'buyers',
  'shop', 'shops', 'store', 'mall', 'api', 'www', 'mail', 'email', 'account',
  'accounts', 'settings', 'login', 'logout', 'signin', 'signup', 'register',
  'me', 'null', 'undefined', 'anonymous', 'guest',
]);

export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^@+/, '').toLowerCase();
}

/** Returns a human-readable reason the username is not allowed, or null. */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN)
    return `Usernames need at least ${USERNAME_MIN} characters`;
  if (username.length > USERNAME_MAX)
    return `Usernames can be at most ${USERNAME_MAX} characters`;
  if (/[^a-z0-9._]/.test(username))
    return 'Use only letters, numbers, periods and underscores';
  if (!/^[a-z0-9]/.test(username))
    return 'Usernames must start with a letter or number';
  if (username.endsWith('.')) return 'Usernames can’t end with a period';
  if (username.includes('..')) return 'Usernames can’t have two periods in a row';
  if (!USERNAME_RE.test(username)) return 'That username isn’t valid';
  if (RESERVED.has(username.replace(/[._]/g, '')))
    return 'That username is reserved';
  return null;
}

/** A valid base handle derived from a name or email, e.g. "Jane Doe" → "jane.doe". */
export function usernameBase(name: string, email: string): string {
  const fromName = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const fromEmail = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '');
  let base = (fromName.length >= USERNAME_MIN ? fromName : fromEmail)
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+|[.]+$/g, '')
    .slice(0, USERNAME_MAX - 4);
  if (base.length < USERNAME_MIN) base = `shopper${base}`;
  if (usernameProblem(base)) base = 'shopper';
  return base.replace(/\.+$/, '');
}
