import React from 'react';

type Props = { size?: number; className?: string };

export default function ActiveIcon({ size = 16, className = '' }: Props) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.375;
  const stroke = Math.max(1, s * 0.07);
  const pulseStroke = Math.max(1, s * 0.12);
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <g fill="none" fillRule="evenodd">
        <circle cx={cx} cy={cy} r={r} fill="#22c55e" stroke="#fff" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeOpacity="0.5" strokeWidth={pulseStroke}>
          <animate attributeName="r" from={String(r)} to={String(r * 1.6)} dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.6" to="0" dur="1.2s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}
