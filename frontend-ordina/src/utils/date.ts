import { translate } from '@/i18n/translations';

export function greetingForHour(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return translate('home.morning');
  if (hour < 18) return translate('home.afternoon');
  return translate('home.evening');
}
