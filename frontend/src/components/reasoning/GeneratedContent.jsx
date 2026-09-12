import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { containsQuizSourceReference, normalizeAssistantContent, normalizeGeneratedContent, normalizeQuizDisplayContent, normalizeStudentLessonContent } from '../../utils/generatedContent';
import { normalizeLessonMathContent } from '../../utils/mathContent';
import { rehypeMathRenderingContract, remarkMathRenderingContract } from '../../utils/mathRenderingContract';

const REMARK_PLUGINS = [remarkMath, remarkMathRenderingContract];

function SharedMathMarkdownComponent({ markdown = '', quizText = false, audience = 'internal', assistantText = false, reviewIndicator = false, mathFallback = false, className = '' }) {
  const rootRef = useRef(null);
  const normalized = useMemo(() => {
    if (audience === 'student') return normalizeStudentLessonContent(markdown);
    if (assistantText) return normalizeAssistantContent(markdown);
    if (quizText || containsQuizSourceReference(markdown)) return normalizeQuizDisplayContent(markdown);
    return normalizeGeneratedContent(markdown);
  }, [assistantText, audience, markdown, quizText]);
  const mathResult = useMemo(() => normalizeLessonMathContent(normalized), [normalized]);
  const showReviewIndicator = reviewIndicator && mathResult.needsReview.length > 0 && audience !== 'student';
  const showReviewFallback = mathFallback || (reviewIndicator && audience !== 'student');
  const rehypePlugins = useMemo(() => [
    [rehypeKatex, { throwOnError: false, errorColor: 'inherit', strict: 'ignore' }],
    [rehypeMathRenderingContract, { showReviewFallback }],
  ], [showReviewFallback]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let frame = 0;
    let cancelled = false;

    const classifyWideInlineMath = () => {
      if (cancelled) return;
      root.querySelectorAll('.math-inline').forEach(math => {
        math.classList.remove('is-wide-math');
        const container = math.closest('p, li, blockquote') || math.parentElement || root;
        const renderedMath = math.querySelector('.katex') || math;
        const availableWidth = container.clientWidth;
        const naturalWidth = Math.ceil(renderedMath.getBoundingClientRect().width || renderedMath.scrollWidth);
        math.classList.toggle('is-wide-math', availableWidth > 0 && naturalWidth > availableWidth + 1);
      });
    };
    const scheduleClassification = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(classifyWideInlineMath);
    };

    scheduleClassification();
    document.fonts?.ready.then(() => { if (!cancelled) scheduleClassification(); });
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleClassification);
    observer?.observe(root);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [mathResult.content]);

  return <div
    ref={rootRef}
    className={`math-content generated-doc-markdown ${mathResult.needsReview.length ? 'has-math-review' : ''} ${className}`.trim()}
    data-needs-review={mathResult.needsReview.length || undefined}
  >
    {showReviewIndicator && <div className="math-review-needed" role="note">
      <span>Review math:</span>
      {mathResult.needsReview.slice(0, 3).map((item, index) => <code key={`${item.original}-${index}`}>{item.original}</code>)}
    </div>}
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={rehypePlugins}
      skipHtml
      components={{
        h1: props => <h2 {...props}/>,
        h2: props => <h3 {...props}/>,
        h3: props => <h4 {...props}/>,
        h4: props => <h5 {...props}/>,
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
      }}
    >
      {mathResult.content}
    </ReactMarkdown>
  </div>;
}

export const SharedMathMarkdown = memo(SharedMathMarkdownComponent);
export default SharedMathMarkdown;
