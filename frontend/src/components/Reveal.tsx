import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
};

export function Reveal({ children, className = "", delay = 0, distance = 24 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(() => typeof window !== "undefined" && "IntersectionObserver" in window);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) {
      setPending(false);
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.unobserve(entry.target);
    }, { rootMargin: "0px 0px -8%", threshold: 0.12 });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`topiq-reveal ${pending ? "is-pending" : ""} ${visible ? "is-visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms`, "--reveal-distance": `${distance}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
