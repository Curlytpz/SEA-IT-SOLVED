import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { containsQuizSourceReference, normalizeAssistantContent, normalizeGeneratedContent, normalizeQuizDisplayContent, normalizeStudentLessonContent } from '../../utils/generatedContent';
import { normalizeLessonMathContent } from '../../utils/mathContent';

const REMARK_PLUGINS = [remarkMath];

function rehypeMathContract(options = {}) {
  const showReviewFallback = Boolean(options.showReviewFallback);
  return tree => {
    const visit = (node, insideDisplay = false) => {
      if (!node || typeof node !== 'object') return;
      const classes = Array.isArray(node.properties?.className) ? node.properties.className : [];
      if (classes.includes('katex-error')) {
        node.properties = {
          ...node.properties,
          className: [...new Set([...classes, showReviewFallback ? 'math-review-needed' : 'math-invalid-hidden'])],
          title: undefined,
          role: showReviewFallback ? 'note' : undefined,
          'aria-label': showReviewFallback ? 'Mathematical expression needs instructor review' : undefined,
          'aria-hidden': showReviewFallback ? undefined : 'true',
        };
        node.children = showReviewFallback ? [{ type: 'text', value: 'Review math' }] : [];
        return;
      }
      const isDisplay = classes.includes('katex-display');
      if (isDisplay) node.properties.className = [...new Set([...classes, 'math-block', 'math-scroll'])];
      else if (!insideDisplay && classes.includes('katex')) node.properties.className = [...new Set([...classes, 'math-inline'])];
      node.children?.forEach(child => visit(child, insideDisplay || isDisplay));
    };
    visit(tree);
  };
}

function GeneratedContent({ markdown = '', quizText = false, audience = 'internal', assistantText = false, reviewIndicator = false }) {
  const normalized = useMemo(() => {
    if (audience === 'student') return normalizeStudentLessonContent(markdown);
    if (assistantText) return normalizeAssistantContent(markdown);
    if (quizText || containsQuizSourceReference(markdown)) return normalizeQuizDisplayContent(markdown);
    return normalizeGeneratedContent(markdown);
  }, [assistantText, audience, markdown, quizText]);
  const mathResult = useMemo(() => normalizeLessonMathContent(normalized), [normalized]);
  const showReviewIndicator = reviewIndicator && mathResult.needsReview.length > 0 && audience !== 'student';
  const rehypePlugins = useMemo(() => [
    [rehypeKatex, { throwOnError: false, errorColor: 'inherit', strict: 'ignore' }],
    [rehypeMathContract, { showReviewFallback: false }],
  ], []);

  return <div
    className={`math-content generated-doc-markdown ${mathResult.needsReview.length ? 'has-math-review' : ''}`}
    data-needs-review={mathResult.needsReview.length || undefined}
  >
    {showReviewIndicator && <div className="math-review-needed" role="note">Review math</div>}
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
export default memo(GeneratedContent);
