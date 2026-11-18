// Text with **bold** pieces, so a translated paragraph keeps its emphasis wherever the
// words fall (a <strong> per piece, nothing else is interpreted).
export default function Bold({ text }) {
  return text
    .split("**")
    .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part || null));
}
