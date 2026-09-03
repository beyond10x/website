export const SEARCH_AUDIENCE_VOCABULARY = Object.freeze([
  'adopter',
  'developer',
  'evaluator',
  'operator',
  'researcher',
]);

const audienceVocabulary = new Set(SEARCH_AUDIENCE_VOCABULARY);

export function experienceIdsForSourceDocument({schema, effective}) {
  if (schema !== 'b10x-docs/v4') return [];
  if (!effective || !Array.isArray(effective.experienceIds)) {
    throw new Error('v4 source document metadata must be resolved before assigning experience membership');
  }
  return [...new Set(effective.experienceIds)];
}

export function assertSearchAudienceVocabulary(audiences, context = 'search metadata') {
  if (!Array.isArray(audiences)) throw new Error(`${context} audiences must be an array`);
  const undeclared = audiences.filter((audience) => !audienceVocabulary.has(audience));
  if (undeclared.length > 0) {
    throw new Error(`${context} uses undeclared audience values: ${[...new Set(undeclared)].join(', ')}`);
  }
  return audiences;
}
