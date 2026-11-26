import React, { useEffect, useRef, useState } from 'react';
import type { BalancePoint, ChartRange } from '../shared/types.ts';
import { fmtClock, fmtUsd } from '../lib/i18n.ts';

interface PerformanceChartProps {
  points: BalancePoint[];
  startEquity: number;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  onHoverPoint?: (pt: BalancePoint | null) => void;
}

const RANGES: ChartRange[] = ['LIVE', '1H', '4H', '1D', '1W', 'ALL'];

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  points,
  startEquity,
  range,
  onRangeChange,
  onHoverPoint,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dims, setDims] = useState({ width: 640, height: 220 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(280, Math.floor(entry.contentRect.width));
        setDims({ width: w, height: w > 640 ? 236 : 204 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.width * dpr;
    canvas.height = dims.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = dims.width;
    const h = dims.height;
    const padTop = 38;
    const padBottom = 18;
    const padX = 4;

    ctx.clearRect(0, 0, w, h);

    const values = points.map((p) => p.equity);
    const minVal = Math.min(...values, startEquity) * 0.992;
    const maxVal = Math.max(...values, startEquity) * 1.008;
    const span = Math.max(1, maxVal - minVal);

    const xOf = (i: number) => padX + (i / (points.length - 1)) * (w - padX * 2);
    const yOf = (val: number) => padTop + ((maxVal - val) / span) * (h - padTop - padBottom);

    const lastVal = points[points.length - 1].equity;
    const isPositive = lastVal >= startEquity;
    const lineColor = isPositive ? '#00d35a' : '#ff453a';

    // Dashed start baseline
    const baseY = yOf(startEquity);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(235, 235, 245, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, baseY);
    ctx.lineTo(w - padX, baseY);
    ctx.stroke();
    ctx.restore();

    // Gradient under line
    const grad = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
    if (isPositive) {
      grad.addColorStop(0, 'rgba(0, 211, 90, 0.22)');
      grad.addColorStop(1, 'rgba(0, 211, 90, 0.0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 69, 58, 0.22)');
      grad.addColorStop(1, 'rgba(255, 69, 58, 0.0)');
    }

    ctx.beginPath();
    points.forEach((pt, idx) => {
      const x = xOf(idx);
      const y = yOf(pt.equity);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(points.length - 1), h - padBottom);
    ctx.lineTo(xOf(0), h - padBottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Main line
    ctx.beginPath();
    points.forEach((pt, idx) => {
      const x = xOf(idx);
      const y = yOf(pt.equity);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Non-overlapping trade markers above line (STEP 10 spec)
    const placedLabels: Array<{ x1: number; x2: number; row: number }> = [];
    ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';

    points.forEach((pt, idx) => {
      if (!pt.marker) return;
      const x = xOf(idx);
      const y = yOf(pt.equity);
      const markerColor = pt.marker.tone === 'green' ? '#00d35a' : '#ff453a';

      // Dot on curve
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label above line, stacked into rows if overlapping
      const text = pt.marker.label;
      const textW = ctx.measureText(text).width + 8;
      let labelX = Math.max(4, Math.min(w - textW - 4, x - textW / 2));
      let row = 0;
      while (
        placedLabels.some((r) => r.row === row && !(labelX + textW < r.x1 || labelX > r.x2)) &&
        row < 2
      ) {
        row += 1;
      }
      placedLabels.push({ x1: labelX, x2: labelX + textW, row });
      const labelY = Math.max(12, Math.min(y - 12, 14 + row * 15));

      ctx.fillStyle = markerColor;
      ctx.fillText(text, labelX + 4, labelY);
    });

    // Hover crosshair
    if (hoverIdx !== null && points[hoverIdx]) {
      const hx = xOf(hoverIdx);
      const hy = yOf(points[hoverIdx].equity);

      ctx.save();
      ctx.strokeStyle = 'rgba(235, 235, 245, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, padTop - 8);
      ctx.lineTo(hx, h - padBottom);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [points, startEquity, dims, hoverIdx]);

  const handlePointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(relX * (points.length - 1));
    setHoverIdx(idx);
    onHoverPoint?.(points[idx] ?? null);
  };

  const clearPointer = () => {
    setHoverIdx(null);
    onHoverPoint?.(null);
  };

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="w-full">
      <div className="h-5 mb-1 flex items-center justify-between text-xs text-[rgba(235,235,245,0.6)] font-mono-num">
        {hovered ? (
          <span>
            {fmtUsd(hovered.equity)} · {fmtClock(hovered.ts)}
            {hovered.marker ? ` · ${hovered.marker.label}` : ''}
          </span>
        ) : (
          <span>Start {fmtUsd(startEquity)}</span>
        )}
        <span>{range}</span>
      </div>

      <div ref={containerRef} className="w-full relative touch-none">
        <canvas
          ref={canvasRef}
          style={{ width: dims.width, height: dims.height }}
          className="block w-full cursor-crosshair"
          onMouseMove={(e) => handlePointer(e.clientX)}
          onMouseLeave={clearPointer}
          onTouchStart={(e) => e.touches[0] && handlePointer(e.touches[0].clientX)}
          onTouchMove={(e) => e.touches[0] && handlePointer(e.touches[0].clientX)}
          onTouchEnd={clearPointer}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-b border-[rgba(84,84,88,0.4)] pb-3">
        <div className="flex items-center gap-1 sm:gap-2">
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={`min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold font-mono-num transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#2c2c2e] text-white'
                    : 'text-[rgba(235,235,245,0.55)] hover:text-white'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
