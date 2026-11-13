/**
 * Which seller details can be changed, how each change is authorised, and the
 * reasons a seller can choose from. Served to the seller app so the dropdowns
 * always match what the backend accepts.
 */

export type ProfileField =
  | 'EMAIL'
  | 'PHONE'
  | 'FULL_NAME'
  | 'BUSINESS_NAME'
  | 'BUSINESS_ADDRESS'
  | 'TAX_ID';

/**
 * - OTP_NEW_EMAIL: a code goes to the NEW address, proving the seller owns it.
 * - OTP_CURRENT_EMAIL: a code goes to the current login email (step-up check).
 *   Used for phone until an SMS provider is connected.
 * - ADMIN_REVIEW: KYC-verified details; a Quza admin approves or rejects.
 */
export type ChangeChannel = 'OTP_NEW_EMAIL' | 'OTP_CURRENT_EMAIL' | 'ADMIN_REVIEW';

export type ChangeStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_REVIEW'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export const OPEN_STATUSES: ChangeStatus[] = ['PENDING_VERIFICATION', 'PENDING_REVIEW'];

export interface ReasonOption {
  code: string;
  label: string;
}

export interface FieldDefinition {
  field: ProfileField;
  label: string;
  channel: ChangeChannel;
  /** Business details can only change once KYC has been verified. */
  requiresVerifiedKyc: boolean;
  /** Plain-language summary of what happens after the seller submits. */
  process: string;
  /** Where the new value is written once the change is approved/confirmed. */
  updates: string[];
  reasons: ReasonOption[];
}

const OTHER: ReasonOption = { code: 'OTHER', label: 'Other (please explain)' };

export const PROFILE_FIELDS: FieldDefinition[] = [
  {
    field: 'EMAIL',
    label: 'Email address',
    channel: 'OTP_NEW_EMAIL',
    requiresVerifiedKyc: false,
    process:
      'We send a 6-digit code to the new address. Once you enter it, your login email changes immediately and we notify your old address.',
    updates: ['Login email', 'Shop contact email (where it matched your old email)'],
    reasons: [
      { code: 'NO_LONGER_USED', label: 'I no longer use this email address' },
      { code: 'BUSINESS_EMAIL', label: 'Switching to a business email' },
      { code: 'LOST_ACCESS', label: 'I lost access to this email account' },
      { code: 'SECURITY_CONCERN', label: 'Security concern with this email account' },
      { code: 'TYPO', label: 'There was a mistake when I registered' },
      OTHER,
    ],
  },
  {
    field: 'PHONE',
    label: 'Phone number',
    channel: 'OTP_CURRENT_EMAIL',
    requiresVerifiedKyc: false,
    process:
      'We send a 6-digit code to your current login email to confirm it is you. Once you enter it, your phone number changes everywhere it is used.',
    updates: [
      'Account phone',
      'Business verification (KYC) phone',
      'Shop contact phone (where it matched your old number)',
    ],
    reasons: [
      { code: 'NEW_NUMBER', label: 'I have a new phone number' },
      { code: 'LOST_SIM', label: 'My SIM card was lost or stolen' },
      { code: 'BUSINESS_LINE', label: 'Switching to a business line' },
      { code: 'TYPO', label: 'There was a mistake when I registered' },
      OTHER,
    ],
  },
  {
    field: 'FULL_NAME',
    label: 'Full legal name',
    channel: 'ADMIN_REVIEW',
    requiresVerifiedKyc: false,
    process:
      'Your name is checked against your ID, so a Quza admin reviews the change. Attach a photo of a supporting document to speed things up.',
    updates: ['Account name'],
    reasons: [
      { code: 'LEGAL_NAME_CHANGE', label: 'Legal name change (marriage, deed poll, etc.)' },
      { code: 'SPELLING_CORRECTION', label: 'Correcting a spelling mistake' },
      { code: 'MATCH_ID', label: 'Making it match my national ID / passport' },
      OTHER,
    ],
  },
  {
    field: 'BUSINESS_NAME',
    label: 'Registered business name',
    channel: 'ADMIN_REVIEW',
    requiresVerifiedKyc: true,
    process:
      'Business details were verified during KYC, so a Quza admin reviews the change. Attach your updated registration certificate if you have one.',
    updates: ['Business verification (KYC) record'],
    reasons: [
      { code: 'REBRANDED', label: 'The business has rebranded' },
      { code: 'REGISTERED_NAME_CHANGED', label: 'Registered name changed with the registrar' },
      { code: 'OWNERSHIP_CHANGE', label: 'Change of business ownership' },
      { code: 'SPELLING_CORRECTION', label: 'Correcting a spelling mistake' },
      OTHER,
    ],
  },
  {
    field: 'BUSINESS_ADDRESS',
    label: 'Business address',
    channel: 'ADMIN_REVIEW',
    requiresVerifiedKyc: true,
    process:
      'Business details were verified during KYC, so a Quza admin reviews the change. Attach proof of address (e.g. a utility bill or lease) if you have one.',
    updates: ['Business verification (KYC) record'],
    reasons: [
      { code: 'RELOCATED', label: 'The business has moved' },
      { code: 'NEW_BRANCH', label: 'Main location changed to another branch' },
      { code: 'CORRECTION', label: 'Correcting a mistake in the address' },
      OTHER,
    ],
  },
  {
    field: 'TAX_ID',
    label: 'Tax ID / KRA PIN',
    channel: 'ADMIN_REVIEW',
    requiresVerifiedKyc: true,
    process:
      'Your tax PIN is used for compliance, so a Quza admin verifies the change. Attach your PIN certificate if you have one.',
    updates: ['Business verification (KYC) record'],
    reasons: [
      { code: 'INCORRECT_PIN', label: 'The PIN I submitted was incorrect' },
      { code: 'RE_REGISTERED', label: 'The business was re-registered with a new PIN' },
      { code: 'INDIVIDUAL_TO_COMPANY', label: 'Moving from a personal PIN to a company PIN' },
      OTHER,
    ],
  },
];

export const FIELD_BY_KEY = new Map(PROFILE_FIELDS.map((f) => [f.field, f]));

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
/** Maximum change requests a seller can start for one field in 24 hours. */
export const MAX_REQUESTS_PER_FIELD_PER_DAY = 3;
