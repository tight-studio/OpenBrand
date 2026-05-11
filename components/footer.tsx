export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`px-6 pb-10 text-center text-sm text-neutral-400 ${className}`}
    >
      OpenBrand is designed, built, and backed by{" "}
      <a
        href="https://tight.studio/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-neutral-600 transition-colors"
      >
        Tight Studio
      </a>
      .
    </footer>
  );
}
