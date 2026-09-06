/**
 * The bathymetric substrate the whole screen sits on: faint nested depth
 * contours and a scatter of soundings, fixed behind the survey so the cards
 * read as sample sites marked on a chart. Purely decorative.
 */
export default function ChartField() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      viewBox="0 0 1200 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="hsl(var(--lure))" strokeOpacity="0.12" strokeWidth="1.5">
        <path d="M 620 90 C 900 120 1120 300 1050 520 C 990 720 720 860 470 810 C 210 760 60 540 130 330 C 190 150 400 60 620 90 Z" />
        <path d="M 610 220 C 810 245 960 380 910 540 C 865 685 660 780 470 740 C 285 700 175 545 220 395 C 260 260 420 200 610 220 Z" />
        <path d="M 600 330 C 730 350 830 445 795 555 C 763 655 630 715 505 688 C 380 660 305 555 335 455 C 363 362 470 315 600 330 Z" />
        <path d="M 590 430 C 665 443 720 500 700 565 C 682 625 605 660 530 644 C 458 628 415 566 433 507 C 450 452 515 420 590 430 Z" />
      </g>
      <g fill="hsl(var(--lure))" fillOpacity="0.14">
        <circle cx="235" cy="180" r="2.5" />
        <circle cx="960" cy="150" r="2.5" />
        <circle cx="1075" cy="470" r="2.5" />
        <circle cx="820" cy="760" r="2.5" />
        <circle cx="430" cy="835" r="2.5" />
        <circle cx="120" cy="560" r="2.5" />
        <circle cx="560" cy="120" r="2" />
        <circle cx="690" cy="905" r="2" />
      </g>
    </svg>
  );
}
