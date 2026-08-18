/**
 * The board's wordmark, for every header that carries one.
 *
 * It used to be an inert div: the most obvious thing to click when you want to
 * get back was the one thing that did nothing, so from Insights or Settings you
 * had to hunt for the back button. It is an anchor now, which is where the
 * pointer, the focus ring and Enter come from, instead of three behaviours
 * simulated on a div. On the board it points at the board, the least surprising
 * thing it can do there, and says so with aria-current.
 */
export function Wordmark({
  label,
  current = false,
}: {
  /** Accessible name, which has to say where the link goes. */
  label: string;
  /** True on the board itself, where the link is already where it leads. */
  current?: boolean;
}) {
  return (
    <a
      className="logo"
      href="/home"
      aria-label={label}
      aria-current={current ? "page" : undefined}
    >
      over<span>click</span>
    </a>
  );
}
