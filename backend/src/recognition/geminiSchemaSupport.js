const GEMINI_JSON_SCHEMA_KEYWORDS = new Set([
  '$id','$defs','$ref','$anchor','type','format','title','description','enum',
  'items','prefixItems','minItems','maxItems','minimum','maximum','anyOf','oneOf',
  'properties','additionalProperties','required','propertyOrdering',
]);

function assertGeminiJsonSchema(schema, path = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  for (const [key,value] of Object.entries(schema)) {
    if (!GEMINI_JSON_SCHEMA_KEYWORDS.has(key)) {
      throw new Error(`Unsupported Gemini response schema keyword "${key}" at ${path}.`);
    }
    if (key === 'properties' || key === '$defs') {
      for (const [name,child] of Object.entries(value || {})) assertGeminiJsonSchema(child, `${path}.${key}.${name}`);
    } else if (key === 'items' || key === 'additionalProperties') {
      if (value && typeof value === 'object') assertGeminiJsonSchema(value, `${path}.${key}`);
    } else if (key === 'prefixItems' || key === 'anyOf' || key === 'oneOf') {
      for (const [index,child] of (Array.isArray(value) ? value : []).entries()) assertGeminiJsonSchema(child, `${path}.${key}[${index}]`);
    }
  }
}

module.exports = { GEMINI_JSON_SCHEMA_KEYWORDS, assertGeminiJsonSchema };
