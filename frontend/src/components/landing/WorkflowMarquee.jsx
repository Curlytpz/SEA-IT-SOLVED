import { motion, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'framer-motion';

const ITEMS = ['Capture', 'Review', 'Generate', 'Learn & Analyze'];
const DOT_COLORS = ['#5EEAD4', '#2DD4BF', '#0F9F8F', 'hsl(var(--muted-foreground))'];

export default function WorkflowMarquee() {
  const reducedMotion = useReducedMotion();
  const loopItems = [...ITEMS, ...ITEMS, ...ITEMS, ...ITEMS];

  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { stiffness: 300, damping: 40 });
  const skew = useTransform(smoothVelocity, [-3500, 0, 3500], [-6, 0, 6]);

  return (
    <div className="landing-section-dark relative overflow-hidden border-y border-border bg-background py-6">
      <motion.div style={reducedMotion ? undefined : { skewX: skew }}>
        <motion.div
          className="flex w-max items-center gap-12 whitespace-nowrap text-2xl font-bold uppercase tracking-tight text-foreground/[0.13] sm:text-3xl"
          animate={reducedMotion ? undefined : { x: ['0%', '-50%'] }}
          transition={reducedMotion ? undefined : { repeat: Infinity, duration: 26, ease: 'linear' }}
        >
          {loopItems.map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-4">
              {item}
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DOT_COLORS[i % 4] }} />
            </span>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
