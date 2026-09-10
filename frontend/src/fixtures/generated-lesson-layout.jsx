import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import '../index.css';
import GeneratedLessonDocument from '../components/reasoning/GeneratedLessonDocument';

const paragraph = segments => ({ type: 'paragraph', segments });
const text = value => ({ type: 'text', text: value });
const inlineMath = latex => ({ type: 'math-inline', latex });
const displayMath = latex => ({ type: 'math-block', latex });

const documentModel = {
  title: 'Limits and Continuous Change',
  subjectCode: 'CALC2',
  subjectName: 'Calculus 2',
  sectionName: 'CPE-401',
  instructor: 'Layout Regression Fixture',
  lessonDate: '2026-09-09T00:00:00.000Z',
  sections: [
    {
      id: 'concept-explanation',
      materialId: 'fixture-concept',
      materialType: 'concept',
      title: 'Concept Explanation',
      blocks: [
        paragraph([
          text('A limit describes the value that '), inlineMath('f(x)'),
          text(' approaches as '), inlineMath('x'), text(' approaches '),
          inlineMath('c'), text(', even when the function value is defined separately.'),
        ]),
        paragraph([
          text('For a small change '), inlineMath('h'), text(', compare '),
          inlineMath('\\frac{1}{\\sqrt{9+h}+3}'), text(' with the nearby value and examine '),
          inlineMath('\\lim_{h\\to 0}'), text(' carefully.'),
        ]),
        displayMath('\\lim_{x\\to 0}\\frac{\\sin(3x)}{x}=3\\lim_{x\\to 0}\\frac{\\sin(3x)}{3x}=3'),
        { type: 'bullet', segments: [text('Superscripts remain readable: '), inlineMath('x^2+y^2=r^2'), text('.')] },
        { type: 'bullet', segments: [text('Subscripts stay inside the line box: '), inlineMath('x_{n+1}=x_n-\\frac{f(x_n)}{f\' (x_n)}'), text('.')] },
        { type: 'note', label: 'Remember', segments: [text('Inline mathematics should wrap as one readable unit without colliding with adjacent prose.')] },
      ],
    },
    {
      id: 'limit-versus-value',
      materialId: 'fixture-limit-value',
      materialType: 'worked-example',
      title: 'Limit vs. Function Value',
      blocks: [
        paragraph([
          text('The left-hand limit '), inlineMath('\\lim_{x\\to c^-}f(x)'),
          text(' and right-hand limit '), inlineMath('\\lim_{x\\to c^+}f(x)'),
          text(' must agree for the two-sided limit to exist.'),
        ]),
        displayMath('f(-0.01)=\\frac{\\sin(-0.01)}{-0.01}=0.999983'),
        paragraph([
          text('A derivative quotient such as '),
          inlineMath('\\frac{f(x+h)-f(x)}{h}'),
          text(' may be embedded in a sentence while preserving comfortable vertical spacing.'),
        ]),
        displayMath('\\frac{\\frac{x^2-1}{x-1}}{\\frac{x+1}{2x}}=\\frac{2x(x+1)}{x+1}=2x'),
        paragraph([
          text('This deliberately long inline expression verifies the local overflow fallback: '),
          inlineMath('\\int_{0}^{2\\pi}\\frac{\\left(1+\\sin^2 x\\right)^4\\left(1+\\cos^2 x\\right)^3}{\\sqrt{1+\\tan^2 x}}\\,dx=\\sum_{k=0}^{12}\\frac{(-1)^k}{2k+1}'),
          text(' while the surrounding paper remains fixed.'),
        ]),
      ],
    },
    {
      id: 'worked-example',
      materialId: 'fixture-worked-example',
      materialType: 'worked-example',
      title: 'Worked Example',
      blocks: [
        paragraph([text('Evaluate the limit by factoring before substitution.')]),
        displayMath('\\lim_{x\\to 3}\\frac{x^2-9}{x-3}=\\lim_{x\\to 3}\\frac{(x-3)(x+3)}{x-3}'),
        displayMath('=\\lim_{x\\to 3}(x+3)=6'),
        { type: 'number', number: 1, segments: [text('Identify the indeterminate form '), inlineMath('\\frac{0}{0}'), text('.')] },
        { type: 'number', number: 2, segments: [text('Factor the numerator and cancel only for '), inlineMath('x\\ne3'), text('.')] },
        { type: 'number', number: 3, segments: [text('Evaluate the simplified expression to obtain '), inlineMath('6'), text('.')] },
      ],
    },
  ],
};

const params = new URLSearchParams(window.location.search);
const requestedWidth = Number.parseInt(params.get('width') || '940', 10);
const fixtureWidth = Number.isFinite(requestedWidth) ? Math.max(280, Math.min(1200, requestedWidth)) : 940;

function Fixture() {
  return (
    <main style={{ minHeight: '100vh', padding: '24px 12px 48px', background: 'hsl(var(--background))' }}>
      <div data-fixture-width={fixtureWidth} style={{ width: `min(100%, ${fixtureWidth}px)`, marginInline: 'auto' }}>
        <GeneratedLessonDocument
          materials={[]}
          documentModel={documentModel}
          audience="internal"
          documentResetKey={`layout-fixture-${fixtureWidth}`}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Fixture />);
