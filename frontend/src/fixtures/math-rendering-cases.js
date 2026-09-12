export const INLINE_MATH_CASES = [
  String.raw`Inline variable: \(x=2\).`,
  String.raw`Inline fraction: \(\frac{3}{2}\).`,
  String.raw`Mixed limit: evaluate \(\lim_{x\to-3}\frac{x^2-9}{x^2+2x-3}\) carefully.`,
  String.raw`Indeterminate form: \(\frac{0}{0}\).`,
  String.raw`Inline root: \(\sqrt{x+1}\).`,
  String.raw`Inline exponent: \(x^{\frac{3}{2}}\).`,
  String.raw`Inline derivative: \(f'(x)\).`,
  String.raw`Inline Greek symbols: \(\alpha+\beta=\gamma\).`,
];

export const DISPLAY_MATH_CASES = [
  ['rational', String.raw`\[\frac{x^2-9}{x^2+2x-3}\]`],
  ['factored', String.raw`\[\frac{(x-3)(x+3)}{(x+3)(x-1)}\]`],
  ['nested-fraction', String.raw`\[\frac{\frac{x+1}{x-1}}{\frac{x-2}{x+2}}\]`],
  ['limit', String.raw`\[\lim_{x\to -3}\frac{x-3}{x-1}\]`],
  ['left-limit', String.raw`\[\lim_{x\to a^-}f(x)\]`],
  ['right-limit', String.raw`\[\lim_{x\to a^+}f(x)\]`],
  ['derivative', String.raw`\[f'(x)=\lim_{h\to0}\frac{f(x+h)-f(x)}{h}\]`],
  ['integral', String.raw`\[\int \frac{\sin x(x\cos x-\sin x)}{x^3}\,dx\]`],
  ['trig', String.raw`\[\frac{\sin(4h)}{3h}\]`],
  ['summation', String.raw`\[\sum_{n=1}^{\infty}\frac{1}{n^2}\]`],
  ['product', String.raw`\[\prod_{k=1}^{n}k\]`],
  ['root', String.raw`\[\sqrt{\frac{x+1}{x-1}}\]`],
  ['matrix', String.raw`\[\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}\]`],
  ['piecewise', String.raw`\[f(x)=\begin{cases}x^2, & x<0 \\ x+1, & x\ge0\end{cases}\]`],
  ['system', String.raw`\[\begin{aligned}2x+y &= 5 \\ x-y &= 1\end{aligned}\]`],
  ['long-mobile-overflow', String.raw`\[\frac{(x-a_1)(x-a_2)(x-a_3)(x-a_4)(x-a_5)(x-a_6)}{(x-b_1)(x-b_2)(x-b_3)(x-b_4)(x-b_5)(x-b_6)}=\sum_{n=1}^{\infty}\frac{(-1)^{n+1}x^n}{n}\]`],
];

export const MALFORMED_MATH_CASE = String.raw`Check this incomplete expression: \(\frac{x+1}{\).`;
