import katex from 'katex';
import '../../../shared/mathContent.cjs';

const mathContentApi = globalThis[Symbol.for('sea-it-solved.mathContent')];
if (!mathContentApi?.createLessonMathNormalizer) throw new Error('The shared lesson math normalizer is unavailable.');

export const normalizeLessonMathContent = mathContentApi.createLessonMathNormalizer(katex);
