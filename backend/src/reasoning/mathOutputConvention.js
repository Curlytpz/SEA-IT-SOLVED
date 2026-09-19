module.exports = `For user-facing educational text, write mathematics as valid LaTeX:
use $...$ for inline expressions and $$...$$ on separate lines for display equations.
After JSON decoding, each LaTeX command must have one backslash.
Do not escape math delimiters, put math in Markdown code fences/backticks, or use raw Unicode approximations in place of proper notation.
Keep ordinary prose, headings, and lists as Markdown when appropriate.`;
