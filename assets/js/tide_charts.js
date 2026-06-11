import {
  addDaysToDateKey,
  addMonthsToDateKey,
  formatDate,
  formatDateTime,
  formatTime,
  localDateKey,
  startOfMonthKey
} from "./tide_format.js";

const COLORS = {
  line: "#3b82f6",
  fill: "rgba(59, 130, 246, 0.10)",
  grid: "rgba(30, 41, 59, 0.28)",
  axis: "#64748b",
  text: "#334155",
  low: "#22c55e",
  high: "#f59e0b",
  threshold: "#2f855a",
  thresholdFill: "rgba(22, 163, 74, 0.20)",
  thresholdSoftFill: "rgba(34, 197, 94, 0.08)",
  thresholdBorder: "rgba(22, 163, 74, 0.48)",
  now: "#ef4444"
};

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, Math.round(rect.width || canvas.parentElement?.clientWidth || 640));
  const height = Math.max(220, Math.round(rect.height || canvas.parentElement?.clientHeight || 280));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  return { ctx, width, height };
}

function paddedRange(values, fallback = [0, 1]) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return fallback;

  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }

  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad), max + pad];
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color || COLORS.text;
  ctx.font = `${options.weight || 500} ${options.size || 12}px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function renderTideChart(canvas, curve, extremes, options = {}) {
  if (!canvas || !curve.length) return;

  const { ctx, width, height } = prepareCanvas(canvas);
  const pad = {
    top: Number.isFinite(options.topPadding) ? options.topPadding : options.legendSpace ? 42 : 18,
    right: 16,
    bottom: Number.isFinite(options.bottomPadding) ? options.bottomPadding : options.timeGrid === "half-day" || options.timeGrid === "month" ? 46 : 34,
    left: Number.isFinite(options.leftPadding) ? options.leftPadding : 46
  };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minTime = curve[0].timeMs;
  const maxTime = curve[curve.length - 1].timeMs;
  const threshold = options.thresholdEnabled ? Number(options.thresholdM) : NaN;
  const [minH, maxH] = paddedRange([...curve.map((point) => point.heightM), threshold]);

  const x = (timeMs) => pad.left + ((timeMs - minTime) / (maxTime - minTime || 1)) * plotW;
  const y = (heightM) => pad.top + (1 - (heightM - minH) / (maxH - minH || 1)) * plotH;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (options.timeGrid === "month" && options.monthBanding !== false) {
    drawMonthBackgroundBands(ctx, pad, plotW, plotH, x, minTime, maxTime, options.timeZone);
  }

  if (options.thresholdEnabled && Number.isFinite(threshold)) {
    const thresholdY = y(threshold);
    if (options.thresholdShadeMode === "harvest-windows") {
      drawHarvestWindowFills(ctx, options.harvestWindows, x, pad, plotW, plotH, thresholdY, options);
    } else if (options.thresholdShadeMode === "below-curve") {
      drawBelowThresholdRegions(ctx, curve, x, y, threshold, thresholdY);
    } else {
      drawThresholdBandFill(ctx, pad, plotW, plotH, thresholdY);
    }
  }

  drawGrid(ctx, width, height, pad, minH, maxH, x, y, minTime, maxTime, options);

  if (options.thresholdEnabled && Number.isFinite(threshold)) {
    const thresholdY = y(threshold);
    if (options.thresholdShadeMode === "harvest-windows") {
      drawHarvestWindowBorders(ctx, options.harvestWindows, x, pad, plotW, plotH, options);
    }
    drawThresholdLine(ctx, pad, plotW, thresholdY, threshold, options);
  }

  drawCurve(ctx, curve, x, y, pad, plotH);
  if (options.showExtremes !== false) {
    drawExtremes(ctx, extremes, x, y, minTime, maxTime, options);
  }

  if (options.now) {
    const nowX = x(options.now.getTime());
    if (nowX >= pad.left && nowX <= pad.left + plotW) {
      ctx.save();
      ctx.strokeStyle = COLORS.now;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(nowX, pad.top);
      ctx.lineTo(nowX, pad.top + plotH);
      ctx.stroke();
      ctx.restore();
      drawText(ctx, "Now", nowX + 5, pad.top + 10, { color: COLORS.now, size: options.tickLabelSize || 11 });
    }
  }
}

function drawGrid(ctx, width, height, pad, minH, maxH, x, y, minTime, maxTime, options) {
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  const yTicks = options.compact ? 5 : 6;
  for (let i = 0; i <= yTicks; i += 1) {
    const value = minH + ((maxH - minH) / yTicks) * i;
    const yy = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(width - pad.right, yy);
    ctx.stroke();
    drawText(ctx, value.toFixed(1), pad.left - 8, yy, { align: "right", color: COLORS.axis, size: options.axisLabelSize || 11 });
  }

  const plotW = width - pad.left - pad.right;
  if (!options.compact && options.timeGrid === "half-day") {
    drawHalfDayTimeGrid(ctx, width, height, pad, x, minTime, maxTime, options.timeZone, options);
    ctx.restore();
    return;
  }

  if (options.timeGrid === "month") {
    drawMonthTimeGrid(ctx, width, height, pad, x, minTime, maxTime, options.timeZone, options);
    ctx.restore();
    return;
  }

  const tickCount = options.compact
    ? Math.min(7, Math.max(3, Math.floor(plotW / 220)))
    : Math.min(10, Math.max(4, Math.floor(plotW / 145)));
  for (let i = 0; i <= tickCount; i += 1) {
    const t = minTime + ((maxTime - minTime) / tickCount) * i;
    const xx = x(t);
    ctx.beginPath();
    ctx.moveTo(xx, pad.top);
    ctx.lineTo(xx, height - pad.bottom);
    ctx.stroke();

    const labelDate = new Date(t);
    const label = options.compact
      ? formatDate(labelDate, options.timeZone)
      : formatDateTime(labelDate, options.timeZone);
    const align = i === 0 ? "left" : i === tickCount ? "right" : "center";
    drawText(ctx, label, xx, height - 16, { align, color: COLORS.axis, size: options.tickLabelSize || 10 });
  }

  ctx.restore();
}

function drawHalfDayTimeGrid(ctx, width, height, pad, x, minTime, maxTime, timeZone, options = {}) {
  const ticks = buildHalfDayTicks(minTime, maxTime, timeZone || "UTC");

  for (const tick of ticks) {
    const xx = x(tick.timeMs);
    if (xx < pad.left || xx > width - pad.right) continue;

    const isDayStart = tick.hour === 0;
    ctx.strokeStyle = isDayStart ? "rgba(30, 41, 59, 0.42)" : "rgba(30, 41, 59, 0.22)";
    ctx.lineWidth = isDayStart ? 1.25 : 1;
    ctx.beginPath();
    ctx.moveTo(xx, pad.top);
    ctx.lineTo(xx, height - pad.bottom);
    ctx.stroke();

    const align = xx - pad.left < 34 ? "left" : width - pad.right - xx < 34 ? "right" : "center";
    drawText(ctx, isDayStart ? formatDate(new Date(tick.timeMs), timeZone) : "12:00", xx, height - 19, {
      align,
      color: COLORS.axis,
      size: options.tickLabelSize || 10,
      weight: isDayStart ? 700 : 500
    });
  }
}

function buildHalfDayTicks(minTime, maxTime, timeZone) {
  const ticks = [];
  let dateKey = localDateKey(new Date(minTime - 86400000), timeZone);
  const endKey = localDateKey(new Date(maxTime + 86400000), timeZone);

  while (dateKey <= endKey) {
    for (const hour of [0, 12]) {
      const date = zonedDateKeyToDate(dateKey, timeZone, hour);
      const timeMs = date.getTime();
      if (timeMs >= minTime && timeMs <= maxTime) {
        ticks.push({ timeMs, hour });
      }
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return ticks.sort((a, b) => a.timeMs - b.timeMs);
}

function drawMonthTimeGrid(ctx, width, height, pad, x, minTime, maxTime, timeZone, options = {}) {
  const zone = timeZone || "UTC";
  const startKey = localDateKey(new Date(minTime), zone);
  const endKey = localDateKey(new Date(maxTime), zone);
  let monthKey = startOfMonthKey(startKey);
  const endMonthKey = startOfMonthKey(endKey);

  while (monthKey <= endMonthKey) {
    const nextMonthKey = addMonthsToDateKey(monthKey, 1);
    const monthStart = zonedDateKeyToDate(monthKey, zone).getTime();
    const nextMonthStart = zonedDateKeyToDate(nextMonthKey, zone).getTime();
    const visibleStart = Math.max(minTime, monthStart);
    const visibleEnd = Math.min(maxTime, nextMonthStart);

    if (visibleEnd > visibleStart) {
      const monthBoundaryX = x(monthStart);
      if (monthStart >= minTime && monthStart <= maxTime) {
        ctx.strokeStyle = "rgba(30, 41, 59, 0.58)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(monthBoundaryX, pad.top);
        ctx.lineTo(monthBoundaryX, height - pad.bottom);
        ctx.stroke();
      }

      const midMonthKey = `${monthKey.slice(0, 8)}15`;
      const midMonth = zonedDateKeyToDate(midMonthKey, zone).getTime();
      if (midMonth >= minTime && midMonth <= maxTime) {
        const midX = x(midMonth);
        ctx.strokeStyle = "rgba(30, 41, 59, 0.26)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(midX, pad.top);
        ctx.lineTo(midX, height - pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        drawText(ctx, formatMidMonthLabel(new Date(midMonth), zone), midX, height - 29, {
          align: "center",
          color: COLORS.axis,
          size: options.tickLabelSize ? Math.max(8, options.tickLabelSize - 1) : 9
        });
      }

      const labelX = x(visibleStart + (visibleEnd - visibleStart) / 2);
      drawText(ctx, formatMonthLabel(new Date(visibleStart + (visibleEnd - visibleStart) / 2), zone), labelX, height - 14, {
        align: "center",
        color: COLORS.axis,
        size: options.axisLabelSize || 11,
        weight: 700
      });
    }

    monthKey = nextMonthKey;
  }
}

function drawMonthBackgroundBands(ctx, pad, plotW, plotH, x, minTime, maxTime, timeZone) {
  const zone = timeZone || "UTC";
  const startKey = localDateKey(new Date(minTime), zone);
  const endKey = localDateKey(new Date(maxTime), zone);
  let monthKey = startOfMonthKey(startKey);
  const endMonthKey = startOfMonthKey(endKey);
  let index = 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();

  while (monthKey <= endMonthKey) {
    const nextMonthKey = addMonthsToDateKey(monthKey, 1);
    const monthStart = zonedDateKeyToDate(monthKey, zone).getTime();
    const nextMonthStart = zonedDateKeyToDate(nextMonthKey, zone).getTime();
    const visibleStart = Math.max(minTime, monthStart);
    const visibleEnd = Math.min(maxTime, nextMonthStart);

    if (visibleEnd > visibleStart && index % 2 === 0) {
      const left = x(visibleStart);
      const right = x(visibleEnd);
      ctx.fillStyle = "rgba(15, 118, 110, 0.075)";
      ctx.fillRect(left, pad.top, right - left, plotH);
    }

    monthKey = nextMonthKey;
    index += 1;
  }

  ctx.restore();
}

function formatMonthLabel(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    month: "long"
  }).format(date);
}

function formatMidMonthLabel(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short"
  }).format(date);
}

function drawThresholdBandFill(ctx, pad, plotW, plotH, thresholdY) {
  ctx.save();
  ctx.fillStyle = COLORS.thresholdSoftFill;
  ctx.fillRect(pad.left, thresholdY, plotW, Math.max(0, pad.top + plotH - thresholdY));
  ctx.restore();
}

function drawThresholdLine(ctx, pad, plotW, thresholdY, threshold, options = {}) {
  ctx.save();
  ctx.strokeStyle = COLORS.threshold;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(pad.left, thresholdY);
  ctx.lineTo(pad.left + plotW, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (options.showThresholdLabel === false) {
    ctx.restore();
    return;
  }

  const outsideLeft = options.thresholdLabelPosition === "left-of-axis";
  drawText(ctx, `\u2264 ${Number(threshold).toFixed(2)}m harvest`, outsideLeft ? pad.left - 10 : pad.left + 8, thresholdY - 8, {
    align: outsideLeft ? "right" : "left",
    color: COLORS.threshold,
    size: 11,
    weight: 700
  });
  ctx.restore();
}

function drawHarvestWindowFills(ctx, windows, x, pad, plotW, plotH, thresholdY, options) {
  const grouped = groupHarvestWindows(windows, options.harvestWindowGroupGapMs);
  if (!grouped.length) return;

  const chartLeft = pad.left;
  const chartRight = pad.left + plotW;
  const chartTop = pad.top;
  const chartBottom = pad.top + plotH;
  const bandTop = Math.max(chartTop, Math.min(thresholdY, chartBottom));

  ctx.save();
  ctx.beginPath();
  ctx.rect(chartLeft, chartTop, plotW, plotH);
  ctx.clip();

  for (const window of grouped) {
    const left = Math.max(chartLeft, x(getWindowTime(window.start)));
    const right = Math.min(chartRight, x(getWindowTime(window.end)));
    if (right <= left) continue;

    ctx.fillStyle = options.harvestWindowTopColor || COLORS.thresholdSoftFill;
    ctx.fillRect(left, chartTop, right - left, Math.max(0, bandTop - chartTop));

    ctx.fillStyle = options.harvestWindowBottomColor || COLORS.thresholdFill;
    ctx.fillRect(left, bandTop, right - left, chartBottom - bandTop);
  }

  ctx.restore();
}

function drawHarvestWindowBorders(ctx, windows, x, pad, plotW, plotH, options) {
  const grouped = groupHarvestWindows(windows, options.harvestWindowGroupGapMs);
  if (!grouped.length) return;

  const chartLeft = pad.left;
  const chartRight = pad.left + plotW;
  const chartTop = pad.top;
  const chartBottom = pad.top + plotH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(chartLeft, chartTop, plotW, plotH);
  ctx.clip();
  ctx.strokeStyle = options.harvestWindowBorderColor || COLORS.thresholdBorder;
  ctx.lineWidth = options.harvestWindowBorderWidth || 1.25;
  ctx.setLineDash(options.harvestWindowBorderDash || [4, 4]);
  const labels = [];

  for (const window of grouped) {
    const left = Math.max(chartLeft, x(getWindowTime(window.start)));
    const right = Math.min(chartRight, x(getWindowTime(window.end)));
    if (right <= left) continue;

    ctx.strokeRect(left, chartTop, right - left, chartBottom - chartTop);

    const label = harvestWindowLabel(window, options);
    const minLabelWidth = options.harvestWindowLabelMinWidth || 36;
    if (label && right - left >= minLabelWidth) {
      const labelY = options.harvestWindowLabelPosition === "above-plot"
        ? Math.max(8, chartTop - (options.harvestWindowLabelOffset || 10))
        : chartTop + 10;
      labels.push({ label, x: (left + right) / 2, y: labelY });
    }
  }

  ctx.restore();

  if (labels.length) {
    ctx.save();
    ctx.setLineDash([]);
    for (const item of labels) {
      drawText(ctx, item.label, item.x, item.y, {
        align: "center",
        color: options.harvestWindowLabelColor || COLORS.threshold,
        size: 10,
        weight: 700
      });
    }
    ctx.restore();
  }
}

function harvestWindowLabel(window, options) {
  if (!options.harvestWindowLabel) return "";
  if (typeof options.harvestWindowLabel === "function") {
    return options.harvestWindowLabel(window);
  }
  return options.harvestWindowLabel;
}

function groupHarvestWindows(windows, gapMs) {
  if (!Array.isArray(windows) || !windows.length) return [];

  const sorted = windows
    .map((window) => ({
      start: getWindowTime(window.start),
      end: getWindowTime(window.end)
    }))
    .filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start)
    .sort((a, b) => a.start - b.start);

  if (!Number.isFinite(gapMs)) return sorted;

  return sorted.reduce((groups, window) => {
    const previous = groups[groups.length - 1];
    if (previous && window.start - previous.end <= gapMs) {
      previous.end = Math.max(previous.end, window.end);
    } else {
      groups.push({ ...window });
    }
    return groups;
  }, []);
}

function getWindowTime(value) {
  if (value instanceof Date) return value.getTime();
  return Number(value);
}

function zonedDateKeyToDate(dateKey, timeZone, hour = 0) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetMs = Date.UTC(year, month - 1, day, hour, 0, 0);
  let utcMs = targetMs;

  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(new Date(utcMs), timeZone);
    const renderedMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const deltaMs = renderedMs - targetMs;
    if (Math.abs(deltaMs) < 1000) break;
    utcMs -= deltaMs;
  }

  return new Date(utcMs);
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function drawBelowThresholdRegions(ctx, curve, x, y, threshold, thresholdY) {
  ctx.save();
  ctx.fillStyle = COLORS.thresholdFill;

  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1];
    const next = curve[i];
    const prevBelow = prev.heightM <= threshold;
    const nextBelow = next.heightM <= threshold;

    if (!prevBelow && !nextBelow) continue;

    const left = prevBelow ? prev : crossingPoint(prev, next, threshold);
    const right = nextBelow ? next : crossingPoint(prev, next, threshold);

    if (!left || !right) continue;

    const x1 = x(left.timeMs);
    const x2 = x(right.timeMs);
    const y1 = y(Math.min(left.heightM, threshold));
    const y2 = y(Math.min(right.heightM, threshold));

    ctx.beginPath();
    ctx.moveTo(x1, thresholdY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, thresholdY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function crossingPoint(prev, next, threshold) {
  const delta = next.heightM - prev.heightM;
  if (!Number.isFinite(delta) || delta === 0) {
    return { timeMs: prev.timeMs, heightM: threshold };
  }

  const ratio = (threshold - prev.heightM) / delta;
  return {
    timeMs: prev.timeMs + (next.timeMs - prev.timeMs) * ratio,
    heightM: threshold
  };
}

function drawCurve(ctx, curve, x, y, pad, plotH) {
  ctx.save();
  ctx.beginPath();
  curve.forEach((point, index) => {
    const xx = x(point.timeMs);
    const yy = y(point.heightM);
    if (index === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  });

  ctx.lineTo(x(curve[curve.length - 1].timeMs), pad.top + plotH);
  ctx.lineTo(x(curve[0].timeMs), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = COLORS.fill;
  ctx.fill();

  ctx.beginPath();
  curve.forEach((point, index) => {
    const xx = x(point.timeMs);
    const yy = y(point.heightM);
    if (index === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  });

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

function drawExtremes(ctx, extremes, x, y, minTime, maxTime, options) {
  ctx.save();

  const visible = extremes.filter((extreme) => extreme.timeMs >= minTime && extreme.timeMs <= maxTime);
  const compact = !!options.compact;
  const stride = compact ? Math.max(1, Math.ceil(visible.length / 28)) : 1;

  visible.forEach((extreme, index) => {
    if (compact && index % stride !== 0) return;

    const xx = x(extreme.timeMs);
    const yy = y(extreme.heightM);
    const isLow = extreme.type === "low";

    ctx.fillStyle = isLow ? COLORS.low : COLORS.high;
    if (isLow) {
      drawDiamond(ctx, xx, yy, 5);
    } else {
      drawTriangle(ctx, xx, yy, 5);
    }

    if (!compact && isLow) {
      drawText(ctx, formatTime(extreme.date, options.timeZone || "UTC"), xx, yy + 12, {
        align: "center",
        color: COLORS.low,
        size: 10,
        weight: 700
      });
    }
  });

  ctx.restore();
}

function drawDiamond(ctx, xPos, yPos, size) {
  ctx.beginPath();
  ctx.moveTo(xPos, yPos - size);
  ctx.lineTo(xPos + size, yPos);
  ctx.lineTo(xPos, yPos + size);
  ctx.lineTo(xPos - size, yPos);
  ctx.closePath();
  ctx.fill();
}

function drawTriangle(ctx, xPos, yPos, size) {
  ctx.beginPath();
  ctx.moveTo(xPos, yPos - size);
  ctx.lineTo(xPos + size, yPos + size);
  ctx.lineTo(xPos - size, yPos + size);
  ctx.closePath();
  ctx.fill();
}
