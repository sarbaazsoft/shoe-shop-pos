export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export type PasswordStrengthLevel = 'none' | 'weak' | 'medium' | 'strong' | 'very-strong';

export interface PasswordStrengthResult {
  score: number; // 0 to 4
  level: PasswordStrengthLevel;
  label: 'Weak' | 'Medium' | 'Strong' | 'Very Strong' | '';
  color: 'rose' | 'amber' | 'emerald' | 'slate';
  textColor: string;
  bgColor: string;
  borderColorClass: string;
  barColor: string;
  requirements: PasswordRequirement[];
  percent: number; // 0, 25, 50, 75, 100
  isStrong: boolean;
  isValid: boolean;
}

export interface PasswordValidationRule {
  id: string;
  label: string;
  met: boolean;
}

export function evaluatePasswordRules(password: string, minChars: number = 8): {
  rules: PasswordValidationRule[];
  allMet: boolean;
  metCount: number;
  totalCount: number;
} {
  const safePassword = password || '';
  const rules: PasswordValidationRule[] = [
    {
      id: 'length',
      label: `At least ${minChars} characters long`,
      met: safePassword.length >= minChars,
    },
    {
      id: 'uppercase',
      label: 'Contains at least one uppercase letter',
      met: /[A-Z]/.test(safePassword),
    },
    {
      id: 'number',
      label: 'Contains at least one number',
      met: /\d/.test(safePassword),
    },
    {
      id: 'special',
      label: 'Contains at least one special character (e.g., !@#$%^&*)',
      met: /[^A-Za-z0-9]/.test(safePassword),
    },
  ];

  const allMet = rules.every((r) => r.met);
  const metCount = rules.filter((r) => r.met).length;

  return {
    rules,
    allMet,
    metCount,
    totalCount: rules.length,
  };
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
        { id: 'length', label: `At least ${minChars} characters long`, met: false },
        { id: 'uppercase', label: 'Contains at least one uppercase letter', met: false },
        { id: 'number', label: 'Contains at least one number', met: false },
        { id: 'special', label: 'Contains at least one special character (e.g., !@#$%^&*)', met: false },
      ],
      percent: 0,
      isStrong: false,
      isValid: false,
    };
  }

  const { rules, allMet } = evaluatePasswordRules(safePassword, minChars);
  const hasMinLength = rules[0].met;
  const hasUpper = rules[1].met;
  const hasNumber = rules[2].met;
  const hasSpecial = rules[3].met;
  const hasLower = /[a-z]/.test(safePassword);
  const hasCasing = hasUpper && hasLower;

  const requirements: PasswordRequirement[] = rules;

  let rawScore = 0;
  if (hasMinLength) rawScore += 1;
  if (hasUpper) rawScore += 1;
  if (hasNumber) rawScore += 1;
  if (hasSpecial) rawScore += 1;

  let score = rawScore;
  let level: PasswordStrengthLevel = 'weak';
  let label: 'Weak' | 'Medium' | 'Strong' | 'Very Strong' = 'Weak';
  let color: 'rose' | 'amber' | 'emerald' = 'rose';
  let textColor = 'text-rose-600 dark:text-rose-400';
  let bgColor = 'bg-rose-50 dark:bg-rose-950/40';
  let borderColorClass = 'password-border-weak border-rose-500 dark:border-rose-500';
  let barColor = 'bg-rose-500';
  let percent = 25;

  if (rawScore === 4 && (safePassword.length >= minChars + 2 || (hasSpecial && hasNumber && hasCasing))) {
    level = 'very-strong';
    label = 'Very Strong';
    color = 'emerald';
    textColor = 'text-emerald-700 dark:text-emerald-300 font-bold';
    bgColor = 'bg-emerald-100 dark:bg-emerald-950/60';
    borderColorClass = 'password-border-strong border-emerald-600 dark:border-emerald-400';
    barColor = 'bg-emerald-600';
    percent = 100;
    score = 4;
  } else if (rawScore >= 3 || (rawScore >= 2 && safePassword.length >= minChars + 2)) {
    level = 'strong';
    label = 'Strong';
    color = 'emerald';
    textColor = 'text-emerald-600 dark:text-emerald-400';
    bgColor = 'bg-emerald-50 dark:bg-emerald-950/40';
    borderColorClass = 'password-border-strong border-emerald-500 dark:border-emerald-500';
    barColor = 'bg-emerald-500';
    percent = 75;
    score = 3;
  } else if (rawScore >= 2 || (hasMinLength && safePassword.length >= 6)) {
    level = 'medium';
    label = 'Medium';
    color = 'amber';
    textColor = 'text-amber-600 dark:text-amber-400';
    bgColor = 'bg-amber-50 dark:bg-amber-950/40';
    borderColorClass = 'password-border-medium border-amber-500 dark:border-amber-500';
    barColor = 'bg-amber-500';
    percent = 50;
    score = 2;
  } else {
    level = 'weak';
    label = 'Weak';
    color = 'rose';
    textColor = 'text-rose-600 dark:text-rose-400';
    bgColor = 'bg-rose-50 dark:bg-rose-950/40';
    borderColorClass = 'password-border-weak border-rose-500 dark:border-rose-500';
    barColor = 'bg-rose-500';
    percent = 25;
    score = Math.max(1, rawScore);
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
    isStrong: level === 'strong' || level === 'very-strong',
    isValid: safePassword.length >= (minChars >= 8 ? 6 : minChars),
  };
}
