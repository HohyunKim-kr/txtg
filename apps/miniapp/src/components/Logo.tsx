export function Logo({ size = 28 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" className="rounded-lg" />;
}

export function Wordmark({ className = "text-lg" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      tx<span className="text-primary">gram</span>
    </span>
  );
}
