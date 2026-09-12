import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import GeneratedContent from './GeneratedContent';
import { PAGE_BOTTOM_SAFE_AREA, paginateMeasuredBlocks } from './lessonPagination';
import { getLessonPageSwipeDirection, resolveLessonGestureAxis } from './lessonReaderGesture';

const MAX_PAPER_WIDTH = 940;
const PAPER_RATIO = 11 / 8.5;
const LETTER_MEASURE_WIDTH = 794;
const MOBILE_READER_QUERY = '(max-width: 639px)';
const MIN_PAGINATED_PAPER_WIDTH = 420;
const MATH_BLOCK_SAFE_GAP = 16;
const BLOCK_ROUNDING_SAFE_GAP = 8;
const MAX_GROUPED_ROWS = 3;

function formatDocumentEquation(latex = '') {
  if (latex.length < 88) return latex;
  const parts = [];
  let braceDepth = 0;
  let start = 0;
  for (let index = 0; index < latex.length; index += 1) {
    const character = latex[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === '{') braceDepth += 1;
    else if (character === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (character === '=' && braceDepth === 0) {
      parts.push(latex.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(latex.slice(start).trim());
  if (parts.length < 3 || parts.some(part => !part)) return latex;
  return `\\begin{aligned}${parts[0]} &= ${parts[1]} ${parts.slice(2).map(part => `\\\\ & = ${part}`).join(' ')}\\end{aligned}`;
}

function canonicalBlockMarkdown(block) {
  if (block.type === 'math-block') return `$$\n${formatDocumentEquation(block.latex || '')}\n$$`;
  if (block.type === 'math-derivation') return (block.expressions || []).map(latex => `$$\n${formatDocumentEquation(latex)}\n$$`).join('\n\n');
  if (block.type === 'heading' || block.type === 'subheading') return `${'#'.repeat(Math.max(1, Math.min(6, block.level || (block.type === 'heading' ? 2 : 3))))} ${block.text || ''}`;
  const content = block.segments?.map(segment => segment.type === 'math-inline' ? `$${segment.latex}$` : segment.text).join('') || '';
  if (block.type === 'bullet') return `- ${content}`;
  if (block.type === 'number') return `${block.number || 1}. ${content}`;
  if (block.type === 'note') return `> ${block.label ? `**${block.label}:** ` : ''}${content}`;
  if (block.type === 'math-review') return '';
  if (block.type === 'code') return `\`\`\`\n${block.text || ''}\n\`\`\``;
  if (block.type === 'table-row') return (block.cells || []).join(' | ');
  if (content) return content;
  if (block.markdown) return block.markdown;
  return '';
}

function semanticMarkdownGroups(blocks = []) {
  const groups = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    // Keep individual equations as separate pagination units.
    if (
      block.type === 'math-derivation' &&
      Array.isArray(block.expressions)
    ) {
      block.expressions
        .filter(Boolean)
        .forEach(expression => {
          groups.push({
            markdown: `$$\n${formatDocumentEquation(expression)}\n$$`,
            type: 'math-block',
          });
        });

      continue;
    }

    const markdown = canonicalBlockMarkdown(block).trim();

    if (!markdown) continue;

    // Keep lists/tables in smaller chunks so the paginator
    // has more opportunities to fill the remaining page space.
    if (['bullet', 'number', 'table-row'].includes(block.type)) {
      const lines = [markdown];

      while (
        blocks[index + 1]?.type === block.type &&
        lines.length < MAX_GROUPED_ROWS
      ) {
        index += 1;
        lines.push(
          canonicalBlockMarkdown(blocks[index]).trim()
        );
      }

      groups.push({
        markdown: lines.join('\n'),
        type: block.type,
      });

      continue;
    }

    /*
     * Do NOT merge the heading with the next paragraph here.
     *
     * Let shouldKeepWithNext() handle heading placement during
     * pagination instead. This gives the paginator two measured
     * blocks instead of one large atomic block.
     */
    groups.push({
      markdown,
      type: block.type,
    });
  }

  return groups;
}

function buildBlocks(materials, documentMeta, documentModel) {
  if (!Array.isArray(documentModel?.sections)) return [];
  const generatedAt = materials.map(item => item.createdAt || item.generatedAt).find(Boolean);
  const modelMeta = documentModel ? {
    lessonTitle: documentModel.title,
    subjectCode: documentModel.subjectCode,
    subjectName: documentModel.subjectName,
    sectionName: documentModel.sectionName,
    instructorName: documentModel.instructor,
    lessonDate: documentModel.lessonDate,
  } : {};
  const blocks = [{
    id: 'document-header',
    kind: 'header',
    generatedAt,
    documentMeta: { ...documentMeta, ...modelMeta },
  }];

  documentModel.sections.forEach((section, sectionIndex) => {
    const groups = semanticMarkdownGroups(section.blocks);
    const first = groups.shift();
    blocks.push({
      id: `document-${section.id || sectionIndex}-heading`,
      kind: 'section',
      title: section.title,
      materialId: section.materialId,
      type: section.materialType,
      markdown: first?.markdown || '',
      semanticType: first?.type,
      sectionNumber: sectionIndex + 1,
    });
    groups.forEach((group, blockIndex) => blocks.push({
      id: `document-${section.id || sectionIndex}-content-${blockIndex}`,
      kind: 'content',
      materialId: section.materialId,
      markdown: group.markdown,
      semanticType: group.type,
    }));
  });
  return blocks;
}
function DocumentEditSkeleton({ compact = false }) {
  return <div className={`generated-document-edit-skeleton ${compact ? 'is-compact' : ''}`} aria-hidden="true">
    <span className="is-heading"/><span/><span/><span className="is-math"/><span/><span className="is-bullet"/>
  </div>;
}

function DocumentMathContent({ markdown, audience }) {
  return <div className="generated-document-math-fit">
    <GeneratedContent markdown={markdown} audience={audience}/>
  </div>;
}

function Block({ block, selectedMaterialId, changedMaterialId, editState, audience }) {
  const isEditing = Boolean(editState?.active && block.materialId && (!editState.targetMaterialId || editState.targetMaterialId === block.materialId));
  const previewMarkdown = editState?.previewReady && editState?.targetMaterialId === block.materialId ? editState.previewMarkdown : '';
  const renderedContent = block.semanticType === 'math-review'
    ? null
    : block.markdown ? <DocumentMathContent markdown={block.markdown} audience={audience}/> : null;
  if (block.kind === 'header') {
    const date = block.generatedAt ? new Date(block.generatedAt) : null;
    const meta = block.documentMeta || {};
    const lessonDate = meta.lessonDate ? new Date(meta.lessonDate) : date;
    return <header className="generated-document-header">
      <p className="generated-document-brand">SEA-IT-SOLVED</p>
      <p className="generated-document-kind">Generated Lesson Materials</p>
      <h2>{meta.lessonTitle || 'Generated Lesson Materials'}</h2>
      <div className="generated-document-rule"/>
      <dl className="generated-document-metadata">
        {(meta.subjectCode || meta.subjectName || meta.sectionName) && <div><dt>Course</dt><dd>{[meta.subjectCode, meta.subjectName, meta.sectionName].filter(Boolean).join(' • ')}</dd></div>}
        {meta.instructorName && <div><dt>Instructor</dt><dd>{meta.instructorName}</dd></div>}
        <div><dt>Lesson date</dt><dd>{lessonDate && !Number.isNaN(lessonDate.getTime()) ? lessonDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified'}</dd></div>
      </dl>
    </header>;
  }
  if (block.kind === 'section') return <section
    className={`generated-document-section-start ${selectedMaterialId === block.materialId ? 'is-selected' : ''} ${changedMaterialId === block.materialId ? 'is-changed' : ''} ${isEditing ? 'is-ai-editing' : ''}`}
  >
    <h3><span aria-hidden="true">{block.sectionNumber}. </span>{block.title}</h3>
    {isEditing ? previewMarkdown
      ? <div className="generated-document-ai-preview"><span>AI editing…</span><DocumentMathContent markdown={previewMarkdown} audience={audience}/></div>
      : <DocumentEditSkeleton/>
      : renderedContent}
  </section>;
  if (isEditing) return previewMarkdown ? null : <DocumentEditSkeleton compact/>;
  return renderedContent;
}

function Paper({ blocks, pageNumber, pageCount, geometry, print = false, continuous = false, mobileReader = false, pageMotion = '', selectedMaterialId, changedMaterialId, editState, audience }) {
  const bottomInset = geometry.paddingBottom + geometry.footerHeight + geometry.bottomSafeArea;
  const numericWidth = typeof geometry.width === 'number' ? geometry.width : LETTER_MEASURE_WIDTH;
  const displayScale = continuous || print ? 1 : Math.max(1, numericWidth / LETTER_MEASURE_WIDTH);
  return <article
    className={`generated-document-paper ${print ? 'generated-document-print-page' : continuous ? 'generated-document-continuous-page' : `generated-document-screen-page ${mobileReader ? `generated-document-mobile-page is-${pageMotion || 'initial'}` : ''}`}`}
    style={{
  width: geometry.width,
  height: continuous ? undefined : geometry.height,
  minHeight: continuous ? undefined : geometry.height,
  padding: `${geometry.paddingTop}px ${geometry.paddingX}px ${bottomInset}px`,
  '--document-paper-scale': displayScale
}}
    aria-label={continuous ? 'Lesson document' : `Lesson document page ${pageNumber} of ${pageCount}`}
  >
    <div className="generated-document-flow">
      {blocks.map(block => <div key={block.id} data-material-id={block.kind === 'section' ? block.materialId : undefined} className={`generated-document-block generated-document-block-${block.semanticType || block.kind}`}><Block block={block} selectedMaterialId={selectedMaterialId} changedMaterialId={changedMaterialId} editState={editState} audience={audience}/></div>)}
    </div>
    {!continuous && <span className="generated-document-page-number" aria-hidden>{pageNumber}</span>}
  </article>;
}

function samePagination(left, right) {
  return left.length === right.length && left.every((page, index) => (
    page.length === right[index]?.length && page.every((block, blockIndex) => block.id === right[index][blockIndex]?.id)
  ));
}

function shouldKeepWithNext(block) {
  const markdown = block?.markdown?.trim() || '';

  return /^#{2,6}\s+/.test(markdown);
}
function measuredBlockHeight(node) {
  const layout = node.getBoundingClientRect();
  let visualTop = layout.top;
  let visualBottom = layout.bottom;
  node.querySelectorAll('.generated-doc-markdown, p, li, h2, h3, h4, h5, blockquote, pre, table, .math-block, .katex-display, .katex').forEach(element => {
    const bounds = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const marginTop = Number.parseFloat(styles.marginTop) || 0;
    const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
    visualTop = Math.min(visualTop, bounds.top - marginTop);
    visualBottom = Math.max(visualBottom, bounds.bottom + marginBottom);
  });
  const visualOverflow = Math.max(0, layout.top - visualTop) + Math.max(0, visualBottom - layout.bottom);
  const mathSafety = node.querySelector('.math-block, .katex-display') ? MATH_BLOCK_SAFE_GAP : 0;
  const renderedHeight = Math.max(layout.height, node.scrollHeight || 0);
  return Math.ceil(renderedHeight + visualOverflow + mathSafety + BLOCK_ROUNDING_SAFE_GAP);
}

export default function GeneratedLessonDocument({ materials = [], documentModel, documentMeta, audience = 'internal', selectedMaterialId, changedMaterialId, editState, onVisibleMaterialChange, onPaginationContextChange, documentResetKey }) {
  const blocks = useMemo(() => buildBlocks(materials, documentMeta, documentModel), [materials, documentMeta, documentModel]);
  const hostRef = useRef(null);
  const measureRef = useRef(null);
  const pointerStart = useRef(null);
  const [paperWidth, setPaperWidth] = useState(MAX_PAPER_WIDTH);
  const [pages, setPages] = useState(() => blocks.length ? [blocks] : []);
  const [currentPage, setCurrentPage] = useState(0);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [mobileViewport, setMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_READER_QUERY).matches);
  const [pageMotion, setPageMotion] = useState('');
  const [printMode, setPrintMode] = useState(false);

  const geometry = useMemo(() => {
    const width = Math.max(240, Math.min(MAX_PAPER_WIDTH, paperWidth));
    return {
      width,
      height: width * PAPER_RATIO,
      paddingX: Math.max(18, Math.min(64, width * 0.065)),
      paddingTop: Math.max(24, Math.min(52, width * 0.065)),
      paddingBottom: Math.max(42, Math.min(64, width * 0.075)),
      footerHeight: Math.max(28, Math.min(36, width * 0.045)),
      bottomSafeArea: PAGE_BOTTOM_SAFE_AREA,
    };
  }, [paperWidth]);
  const mobileStudentReader = audience === 'student' && mobileViewport;
  const continuousReader = !mobileStudentReader && (mobileViewport || paperWidth < MIN_PAGINATED_PAPER_WIDTH);
  const useCanonicalMeasurement = continuousReader;
  const measurementGeometry = useMemo(() => useCanonicalMeasurement ? {
    width: LETTER_MEASURE_WIDTH,
    height: LETTER_MEASURE_WIDTH * PAPER_RATIO,
    paddingX: 64,
    paddingTop: 64,
    paddingBottom: 80,
    footerHeight: 36,
    bottomSafeArea: PAGE_BOTTOM_SAFE_AREA,
  } : geometry, [geometry, useCanonicalMeasurement]);
  const measurementPaperScale = useMemo(() => useCanonicalMeasurement
    ? 1
    : Math.max(1, measurementGeometry.width / LETTER_MEASURE_WIDTH), [measurementGeometry.width, useCanonicalMeasurement]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_READER_QUERY);
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const beforePrint = () => flushSync(() => setPrintMode(true));
    const afterPrint = () => setPrintMode(false);
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => {
      const styles = window.getComputedStyle(host);
      const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
      const contentWidth = host.clientWidth - horizontalPadding;
      setPaperWidth(Math.min(MAX_PAPER_WIDTH, Math.max(240, contentWidth)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const measure = measureRef.current;
    if (!measure || !blocks.length || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setMeasurementRevision(current => current + 1));
    });
    measure.querySelectorAll('[data-document-block]').forEach(node => observer.observe(node));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [blocks, measurementGeometry.width]);

  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) setMeasurementRevision(current => current + 1);
    });
    return () => { cancelled = true; };
  }, [blocks, measurementGeometry.width]);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure || !blocks.length) return;
    const measured = [...measure.querySelectorAll('[data-document-block]')];
    const flow = measure.querySelector('.generated-document-flow');
    const measuredGap = flow ? Number.parseFloat(window.getComputedStyle(flow).rowGap) : 0;
    const blockGap = Number.isFinite(measuredGap) ? measuredGap : 0;
    const capacity = measurementGeometry.height
      - measurementGeometry.paddingTop
      - measurementGeometry.paddingBottom
      - measurementGeometry.footerHeight
      - measurementGeometry.bottomSafeArea;
    const heights = measured.map(measuredBlockHeight);
    const nextPages = paginateMeasuredBlocks({
      blocks,
      heights,
      blockGap,
      capacity,
      shouldKeepWithNext,
    });
    setPages(current => samePagination(current, nextPages) ? current : nextPages);
  }, [blocks, measurementGeometry, measurementRevision]);

  useEffect(() => {
    setCurrentPage(current => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length]);
  useEffect(() => {
    setCurrentPage(0);
  }, [documentResetKey]);
  useEffect(() => {
    const visibleMaterialId = pages[currentPage]?.find(block => block.materialId)?.materialId || '';
    onVisibleMaterialChange?.(visibleMaterialId);
    onPaginationContextChange?.({
      currentPage: currentPage + 1,
      pageCount: pages.length,
      pageMaterialIds: pages.map(page => [...new Set(page.map(block => block.materialId).filter(Boolean))]),
    });
  }, [currentPage, onPaginationContextChange, onVisibleMaterialChange, pages]);

  const visiblePageDotIndexes = useMemo(() => {
    const visibleCount = Math.min(7, pages.length);
    const start = Math.max(0, Math.min(currentPage - Math.floor(visibleCount / 2), pages.length - visibleCount));
    return Array.from({ length: visibleCount }, (_, offset) => start + offset);
  }, [currentPage, pages.length]);
  const sectionCount = Array.isArray(documentModel?.sections) ? documentModel.sections.length : 0;
  if (!sectionCount) return null;
  const goToPreviousPage = () => {
    if (currentPage <= 0) return;
    setPageMotion('previous');
    setCurrentPage(currentPage - 1);
  };
  const goToNextPage = () => {
    if (currentPage >= pages.length - 1) return;
    setPageMotion('next');
    setCurrentPage(currentPage + 1);
  };
  return <section className="generated-document-reader" aria-labelledby="generated-document-title">
    <div className="generated-document-toolbar">
      <div>
        <h2 id="generated-document-title">Lesson material</h2>
        <p>Approved course notes</p>
      </div>
      <div className="generated-document-toolbar-actions">
        <p>{sectionCount} {sectionCount === 1 ? 'section' : 'sections'}{continuousReader ? '' : ` • ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}</p>
        {editState?.active && <span className="generated-document-editing-state">AI editing…</span>}
      </div>
    </div>

    <div
      ref={hostRef}
      className={`generated-document-stage ${continuousReader ? 'is-continuous' : ''} ${mobileStudentReader ? 'is-mobile-reader' : ''}`}
      tabIndex={0}
      onKeyDown={event => {
        if (continuousReader) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); goToPreviousPage(); }
        if (event.key === 'ArrowRight') { event.preventDefault(); goToNextPage(); }
      }}
      onPointerDown={event => {
        if (continuousReader || !event.isPrimary) return;
        pointerStart.current = { startX: event.clientX, startY: event.clientY, id: event.pointerId, axis: null };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={event => {
        const gesture = pointerStart.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        gesture.axis = resolveLessonGestureAxis(event.clientX - gesture.startX, event.clientY - gesture.startY, gesture.axis);
      }}
      onPointerUp={event => {
        const gesture = pointerStart.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        pointerStart.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        const direction = getLessonPageSwipeDirection({ ...gesture, endX: event.clientX, endY: event.clientY });
        if (direction === 'next') goToNextPage();
        if (direction === 'previous') goToPreviousPage();
      }}
      onPointerCancel={event => {
        pointerStart.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      aria-label={continuousReader ? 'Continuous generated lesson document.' : 'Paginated generated lesson. Use left and right arrow keys to change pages.'}
    >
      {(continuousReader ? blocks.length > 0 : pages[currentPage]) && <Paper key={continuousReader ? 'continuous' : currentPage} blocks={continuousReader ? blocks : pages[currentPage]} pageNumber={currentPage + 1} pageCount={pages.length} geometry={geometry} continuous={continuousReader} mobileReader={mobileStudentReader} pageMotion={pageMotion} selectedMaterialId={selectedMaterialId} changedMaterialId={changedMaterialId} editState={editState} audience={audience}/>} 
      <div
        div
  ref={measureRef}
  className={`generated-document-measure generated-document-paper ${
    mobileStudentReader
      ? 'generated-document-screen-page generated-document-mobile-page'
      : ''
  }`}
        style={{ width: measurementGeometry.width, height: 'auto', minHeight: 0, padding: `${measurementGeometry.paddingTop}px ${measurementGeometry.paddingX}px ${measurementGeometry.paddingBottom + measurementGeometry.footerHeight + measurementGeometry.bottomSafeArea}px`, '--document-paper-scale': measurementPaperScale }}
        aria-hidden
      >
        <div className="generated-document-flow">
          {blocks.map(block => <div key={block.id} data-document-block className="generated-document-block"><Block block={block} selectedMaterialId={selectedMaterialId} changedMaterialId={changedMaterialId} editState={editState} audience={audience}/></div>)}
        </div>
      </div>
    </div>

    {!continuousReader && <nav className="generated-document-controls" aria-label="Lesson document pagination">
      <button type="button" onClick={goToPreviousPage} disabled={currentPage === 0}>← Previous</button>
      <div className="generated-document-position">
        <strong aria-live="polite">Page {currentPage + 1} of {pages.length}</strong>
        <div className="generated-document-dots" aria-hidden>
          {visiblePageDotIndexes.map(index => <span key={index} className={index === currentPage ? 'is-active' : ''}/>) }
        </div>
      </div>
      <button type="button" onClick={goToNextPage} disabled={currentPage === pages.length - 1}>Next →</button>
    </nav>}

    {printMode && <div className="generated-document-print-stack" aria-hidden>
      {pages.map((page, index) => <Paper key={page[0]?.id || index} blocks={page} pageNumber={index + 1} pageCount={pages.length} selectedMaterialId={selectedMaterialId} changedMaterialId={changedMaterialId} editState={editState} geometry={{ ...measurementGeometry, width: '8.5in', height: '11in' }} audience={audience} print/>)}
    </div>}
  </section>;
}
