import { useCallback, useMemo } from 'react';

import type { Translate } from '@/i18n';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_ID, type Category } from '@/logic/categories';
import { useI18n } from '@/providers/i18n-provider';
import { useTasksStore } from '@/store/tasks-store';

const FALLBACK: Category = DEFAULT_CATEGORIES.find((category) => category.id === OTHER_CATEGORY_ID)!;

/** A default category shows its translated name until the user renames it. */
export function categoryName(category: Pick<Category, 'name' | 'defaultKey'>, t: Translate) {
  return category.name || (category.defaultKey ? t(`categories.${category.defaultKey}`) : t('categories.other'));
}

/** The user's categories (in their order) plus a lookup by id with translated names. */
export function useCategories() {
  const categories = useTasksStore((state) => state.categories);
  const { t } = useI18n();
  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const find = useCallback((id: string | undefined | null) => (id && byId.get(id)) || byId.get(OTHER_CATEGORY_ID) || categories[0] || FALLBACK, [byId, categories]);
  const nameOf = useCallback((id: string | undefined | null) => categoryName(find(id), t), [find, t]);
  return { categories, find, nameOf };
}
