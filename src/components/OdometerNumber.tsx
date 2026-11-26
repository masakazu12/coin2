import React, { useMemo } from 'react';

interface OdometerNumberProps {
  value: number;
  prefix?: string;
  decimals?: number;
  className?: string;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const OdometerNumber: React.FC<OdometerNumberProps> = ({
  value,
  prefix = '$',
  decimals = 2,
  className = '',
}) => {
  const formatted = useMemo(() => {
    const safe = Number.isFinite(value) ? value : 0;
    const sign = safe < 0 ? '-' : '';
    const absStr = Math.abs(safe).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${sign}${prefix}${absStr}`;
  }, [value, prefix, decimals]);

  return (
    <span
      className={`inline-flex items-baseline font-mono-num tabular-nums tracking-tight select-none ${className}`}
      aria-label={formatted}
    >
      {formatted.split('').map((ch, idx) => {
        const isDigit = ch >= '0' && ch <= '9';
        if (!isDigit) {
          return (
            <span key={`sep-${idx}`} className="inline-block">
              {ch}
            </span>
          );
        }
        const digitNum = Number(ch);
        return (
          <span
            key={`d-${idx}`}
            className="relative inline-block h-[1.08em] w-[0.62em] overflow-hidden align-baseline"
          >
            <span
              className="flex flex-col items-center transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                transform: `translateY(-${digitNum * 10}%)`,
                transitionDelay: `${Math.min(idx * 25, 180)}ms`,
              }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="h-[1.08em] leading-[1.08em]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};
