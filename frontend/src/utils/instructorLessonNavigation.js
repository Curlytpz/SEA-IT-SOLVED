const SECTION_RETURN_PATTERN = /^\/instructor\/sections\/([0-9a-f-]+)\?tab=(reviews|lessons)$/i;

export function sectionReturnPath(sectionId, tab = 'reviews') {
  if (!sectionId || !['reviews', 'lessons'].includes(tab)) return '';
  return `/instructor/sections/${sectionId}?tab=${tab}`;
}

export function safeSectionReturnPath(value) {
  const path = String(value || '');
  return SECTION_RETURN_PATTERN.test(path) ? path : '';
}

export function sectionOriginFromState(state) {
  return [state?.originalReturnTo, state?.returnTo, state?.from]
    .map(safeSectionReturnPath)
    .find(Boolean) || '';
}

export function sectionOriginState(state, fallbackReturnTo = '', extra = {}) {
  const originalReturnTo = sectionOriginFromState(state) || safeSectionReturnPath(fallbackReturnTo);
  const match = originalReturnTo.match(SECTION_RETURN_PATTERN);
  return {
    ...(state || {}),
    ...extra,
    ...(originalReturnTo ? {
      originalReturnTo,
      returnTo: originalReturnTo,
      sectionId: match[1],
      sectionTab: match[2].toLowerCase(),
    } : {}),
  };
}

export function sectionBackLabel(path) {
  if (path.endsWith('?tab=reviews')) return 'Back to Reviews';
  if (path.endsWith('?tab=lessons')) return 'Back to Lessons';
  return 'Back to Section';
}
