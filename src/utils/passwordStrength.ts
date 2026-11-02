export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export type PasswordStrengthLevel = 'none' | 'weak' | 'medium' | 'strong';

export interface PasswordStrengthResult {
  score: number; // 0 to 4
  level: PasswordStrengthLevel;
  label: 'Weak' | 'Medium' | 'Strong' | '';
  color: 'rose' | 'amber' | 'emerald' | 'slate';
  textColor: string;
  bgColor: string;
  borderColorClass: string;
  barColor: string;
  requirements: PasswordRequirement[];
  percent: number; // 0, 33, 66, 100
  isStrong: boolean;
  isValid: boolean;
}

export function evaluatePasswordStrength(
  password: string,
  minCharsOrOptions: number | { minChars?: number } = 8
): PasswordStrengthResult {
  const minChars = typeof minCharsOrOptions === 'number'
    ? minCharsOrOptions
    : minCharsOrOptions?.minChars ?? 8;
  const safePassword = password || '';

  if (!safePassword) {
    return {
      score: 0,
      level: 'none',
      label: '',
      color: 'slate',
      textColor: 'text-slate-400 dark:text-slate-500',
      bgColor: 'bg-slate-100 dark:bg-slate-800',
      borderColorClass: '',
      barColor: 'bg-slate-200 dark:bg-slate-700',
      requirements: [
        { id: 'length', label: `At least ${minChars} characters`, met: false },
        { id: 'casing', label: 'Uppercase & lowercase letters', met: false },
        { id: 'number', label: 'At least one number (0-9)', met: false },
        { id: 'symbol', label: 'At least one special character (!@#$%...)', met: false },
      ],
      percent: 0,
      isStrong: false,
      isValid: false,
    };
  }

  const hasMinLength = safePassword.length >= minChars;
  const hasLower = /[a-z]/.test(safePassword);
  const hasUpper = /[A-Z]/.test(safePassword);
  const hasCasing = hasLower && hasUpper;
  const hasNumber = /\d/.test(safePassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(safePassword);

  const requirements: PasswordRequirement[] = [
    { id: 'length', label: `At least ${minChars} characters`, met: hasMinLength },
    { id: 'casing', label: 'Uppercase & lowercase letters', met: hasCasing },
    { id: 'number', label: 'At least one number (0-9)', met: hasNumber },
    { id: 'symbol', label: 'At least one special character (!@#$%...)', met: hasSpecial },
  ];

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasCasing) score += 1;
  if (hasNumber) score += 1;
  if (hasSpecial) score += 1;

  // Extra credit if lengthy (>= 12 chars) with at least 2 other conditions
  if (safePassword.length >= 12 && score >= 2) {
    score = Math.max(score, 3);
  }

  let level: PasswordStrengthLevel = 'weak';
  let label: 'Weak' | 'Medium' | 'Strong' = 'Weak';
  let color: 'rose' | 'amber' | 'emerald' = 'rose';
  let textColor = 'text-rose-600 dark:text-rose-400';
  let bgColor = 'bg-rose-50 dark:bg-rose-950/40';
  let borderColorClass = 'password-border-weak border-rose-500 dark:border-rose-500';
  let barColor = 'bg-rose-500';
  let percent = 33;

  if (score >= 4 || (score === 3 && safePassword.length >= 10)) {
    level = 'strong';
    label = 'Strong';
    color = 'emerald';
    textColor = 'text-emerald-600 dark:text-emerald-400';
    bgColor = 'bg-emerald-50 dark:bg-emerald-950/40';
    borderColorClass = 'password-border-strong border-emerald-500 dark:border-emerald-500';
    barColor = 'bg-emerald-500';
    percent = 100;
  } else if (score >= 2 && safePassword.length >= 6) {
    level = 'medium';
    label = 'Medium';
    color = 'amber';
    textColor = 'text-amber-600 dark:text-amber-400';
    bgColor = 'bg-amber-50 dark:bg-amber-950/40';
    borderColorClass = 'password-border-medium border-amber-500 dark:border-amber-500';
    barColor = 'bg-amber-500';
    percent = 66;
  } else {
    level = 'weak';
    label = 'Weak';
    color = 'rose';
    textColor = 'text-rose-600 dark:text-rose-400';
    bgColor = 'bg-rose-50 dark:bg-rose-950/40';
    borderColorClass = 'password-border-weak border-rose-500 dark:border-rose-500';
    barColor = 'bg-rose-500';
    percent = 33;
  }

  return {
    score,
    level,
    label,
    color,
    textColor,
    bgColor,
    borderColorClass,
    barColor,
    requirements,
    percent,
    isStrong: level === 'strong',
    isValid: safePassword.length >= (minChars >= 8 ? 6 : minChars),
  };
}
