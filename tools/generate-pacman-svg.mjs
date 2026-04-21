#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';

const profile = 'github';
const outputUrl = new URL('../assets/github-contribution-pacman-chase.svg', import.meta.url);

const width = 860;
const height = 330;
const board = { x: 42, y: 104, width: 776, height: 144 };
const grid = { x: 61, y: 141, step: 14, cell: 10 };
const duration = 48;
const routeCount = 10;
const pelletPostContactDelay = 0.0015;
const pelletStep = 14;
const pelletRadius = 2.6;
const routeSeed = Number.parseInt(process.env.SKUNKWORKS_ROUTE_SEED ?? '', 10) || Date.now();
const random = createRng(routeSeed);
const routes = createRoutes(routeCount);

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function fetchContributionHtml() {
  const response = await fetch(`https://github.com/users/${profile}/contributions`, {
    headers: { 'user-agent': 'github-generator' },
  });
  if (!response.ok) throw new Error(`GitHub contributions request failed: ${response.status}`);
  return response.text();
}

function parseContributionData(html) {
  const total = /<h2[^>]*>\s*([0-9,]+)\s*contributions/i.exec(html)?.[1] ?? 'current';
  const months = [];
  let col = 0;
  const monthRegex = /<td class="ContributionCalendar-label" colspan="(\d+)"[\s\S]*?<span aria-hidden="true"[^>]*>([^<]+)<\/span>/g;
  for (const match of html.matchAll(monthRegex)) {
    months.push({ name: match[2].trim(), col });
    col += Number(match[1]);
  }

  const cells = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let row = 0;
  for (const rowMatch of html.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1];
    if (!rowHtml.includes('ContributionCalendar-day')) continue;
    let colIndex = 0;
    const cellRegex = /data-date="([^"]+)"[^>]*data-level="([0-4])"/g;
    for (const cellMatch of rowHtml.matchAll(cellRegex)) {
      cells.push({
        row,
        col: colIndex,
        date: cellMatch[1],
        level: Number(cellMatch[2]),
      });
      colIndex += 1;
    }
    row += 1;
  }

  if (cells.length < 300) throw new Error(`Parsed only ${cells.length} contribution cells`);
  return { total, months, cells };
}

function fallbackContributionData() {
  const cells = [];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 53; col += 1) {
      const level = ((row * 7 + col * 3) % 11 === 0) ? 4
        : ((row * 5 + col * 2) % 7 === 0) ? 3
        : ((row + col) % 5 === 0) ? 2
        : ((row * 2 + col) % 9 === 0) ? 1
        : 0;
      cells.push({ row, col, level, date: '' });
    }
  }
  return {
    total: 'current',
    months: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'].map((name, index) => ({ name, col: index * 4 })),
    cells,
  };
}

function createRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function randFloat(min, max) {
  return min + (max - min) * random();
}

function randInt(min, max) {
  return Math.floor(randFloat(min, max + 1));
}

function choice(values) {
  return values[randInt(0, values.length - 1)];
}

function addPoint(points, point) {
  const previous = points.at(-1);
  if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
    points.push(point);
  }
}

function createRoutes(count) {
  const caughtFlags = Array.from({ length: count }, () => random() < 0.38);
  while (caughtFlags.filter(Boolean).length < Math.min(2, count)) {
    caughtFlags[randInt(0, count - 1)] = true;
  }
  while (caughtFlags.filter(Boolean).length > count - 2) {
    caughtFlags[randInt(0, count - 1)] = false;
  }

  return caughtFlags.map((caught, index) => createRoute(index, count, caught));
}

function createRoute(index, count, caught) {
  const visibleGap = 0.006;
  const visibleStart = index / count;
  const visibleEnd = Math.min(0.994, ((index + 1) / count) - visibleGap);
  const direction = index % 2 === 0 ? 'right' : 'left';
  const points = createRoutePoints(direction, caught);
  const snakeReachAt = caught ? randFloat(0.84, 0.91) : randFloat(0.82, 0.94);
  const pacReachAt = caught ? clamp(snakeReachAt + randFloat(0.014, 0.040), 0.86, 0.97) : randFloat(0.88, 0.98);
  const snakeStart = caught ? randFloat(0.14, 0.24) : randFloat(0.19, 0.31);
  const pacEnd = caught ? 1 : randFloat(0.70, 0.86);
  const pacDelay = randFloat(0.04, 0.10);
  const snakeLocal = variedMotion(snakeStart, 1, {
    moveAfter: 0,
    reachAt: snakeReachAt,
    steps: randInt(6, 8),
  });
  const pacLocal = variedMotion(0, pacEnd, {
    moveAfter: pacDelay,
    reachAt: pacReachAt,
    steps: randInt(7, 9),
  });
  const snakeMotion = scopedKeyframes(visibleStart, visibleEnd, snakeLocal.keys, snakeLocal.times);
  const pacMotion = scopedKeyframes(visibleStart, visibleEnd, pacLocal.keys, pacLocal.times);

  return {
    id: `r${String(index + 1).padStart(2, '0')}`,
    visible: [visibleStart, visibleEnd],
    points,
    caught,
    catchAt: caught ? visibleStart + pacReachAt * (visibleEnd - visibleStart) : null,
    pacEatsProgress: caught ? 0.98 : Math.max(0.62, pacEnd - 0.02),
    snakeKeys: snakeMotion.keys,
    snakeTimes: snakeMotion.times,
    pacKeys: pacMotion.keys,
    pacTimes: pacMotion.times,
  };
}

function createRoutePoints(direction, caught) {
  const lanes = [144, 158, 172, 186, 200, 214, 228];
  const goingRight = direction === 'right';
  const sign = goingRight ? 1 : -1;
  const startX = goingRight ? 96 : 764;
  const exitX = goingRight ? 930 : -70;
  const catchX = goingRight ? randInt(650, 770) : randInt(90, 220);
  const endX = caught ? catchX : exitX;
  const finalRunStart = caught ? endX - sign * randInt(42, 76) : (goingRight ? 788 : 72);
  const turnCount = randInt(5, 8);
  const points = [[startX, choice(lanes)]];
  let y = points[0][1];

  const stops = Array.from({ length: turnCount }, (_, stopIndex) => {
    const ratio = (stopIndex + 1) / (turnCount + 1);
    const jitter = randFloat(-22, 22);
    return Math.round(startX + sign * (Math.abs(finalRunStart - startX) * ratio + jitter));
  }).sort((left, right) => goingRight ? left - right : right - left);

  let previousX = startX;
  for (const stop of stops) {
    if (Math.abs(stop - previousX) < 42) continue;
    const x = Math.round(clamp(stop, Math.min(startX, finalRunStart), Math.max(startX, finalRunStart)));
    addPoint(points, [x, y]);
    y = nextLane(lanes, y);
    addPoint(points, [x, y]);
    previousX = x;
  }

  addPoint(points, [finalRunStart, y]);
  if (random() < 0.65) {
    y = nextLane(lanes, y);
    addPoint(points, [finalRunStart, y]);
  }
  addPoint(points, [endX, y]);

  return points;
}

function nextLane(lanes, current) {
  const currentIndex = lanes.indexOf(current);
  const candidates = lanes.filter((_, index) => index !== currentIndex && Math.abs(index - currentIndex) <= 4);
  return choice(candidates.length ? candidates : lanes.filter((lane) => lane !== current));
}

function variedMotion(startProgress, endProgress, { moveAfter, reachAt, steps }) {
  const times = [0];
  const keys = [startProgress];
  if (moveAfter > 0.001) {
    times.push(moveAfter);
    keys.push(startProgress);
  }

  const innerCount = Math.max(2, steps - 2);
  const timeRatios = Array.from({ length: innerCount }, (_, index) => (
    clamp(((index + 1) / (innerCount + 1)) + randFloat(-0.055, 0.055), 0.02, 0.98)
  )).sort((left, right) => left - right);
  const progressRatios = Array.from({ length: innerCount }, (_, index) => (
    clamp(((index + 1) / (innerCount + 1)) + randFloat(-0.075, 0.075), 0.02, 0.98)
  )).sort((left, right) => left - right);

  for (let index = 0; index < innerCount; index += 1) {
    const previousTime = times.at(-1);
    const previousKey = keys.at(-1);
    const remaining = innerCount - index;
    const t = clamp(
      moveAfter + (reachAt - moveAfter) * timeRatios[index],
      previousTime + 0.012,
      reachAt - remaining * 0.012,
    );
    const k = clamp(
      startProgress + (endProgress - startProgress) * progressRatios[index],
      previousKey + 0.012,
      endProgress - remaining * 0.012,
    );
    times.push(t);
    keys.push(k);
  }

  times.push(reachAt);
  keys.push(endProgress);
  if (reachAt < 0.999) {
    times.push(1);
    keys.push(endProgress);
  }

  return { keys, times };
}

function scopedKeyframes(visibleStart, visibleEnd, localKeys, localTimes) {
  const keys = [];
  const times = [];
  const add = (key, time) => {
    const safeKey = clamp(key, 0, 1);
    const safeTime = clamp(time, 0, 1);
    if (times.length && Math.abs(safeTime - times.at(-1)) < 0.0005) {
      keys[keys.length - 1] = safeKey;
      times[times.length - 1] = safeTime;
      return;
    }
    keys.push(safeKey);
    times.push(safeTime);
  };

  if (visibleStart > 0) {
    add(localKeys[0], 0);
    add(localKeys[0], visibleStart);
  } else {
    add(localKeys[0], 0);
  }

  for (let index = 1; index < localKeys.length; index += 1) {
    add(localKeys[index], visibleStart + localTimes[index] * (visibleEnd - visibleStart));
  }
  if (visibleEnd < 1) add(localKeys.at(-1), 1);

  return { keys, times };
}

function pathD(points) {
  const [first, ...rest] = points;
  let d = `M${first[0]} ${first[1]}`;
  let previous = first;
  for (const point of rest) {
    if (point[0] === previous[0]) d += ` V${point[1]}`;
    else if (point[1] === previous[1]) d += ` H${point[0]}`;
    else d += ` L${point[0]} ${point[1]}`;
    previous = point;
  }
  return d;
}

function pathSegments(points) {
  const segments = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    segments.push({ x1, y1, x2, y2, length, start: total, horizontal: y1 === y2 });
    total += length;
  }
  return { segments, total };
}

function samplePellets(route) {
  const { segments, total } = pathSegments(route.points);
  const pellets = [];
  const seen = new Set();
  const maxDistance = total * route.pacEatsProgress;
  const addPellet = (distance) => {
    if (distance < 0 || distance > maxDistance) return;
    const point = pointAtDistance(segments, distance);
    if (!point) return;
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (x < board.x + 14 || x > board.x + board.width - 14 || y < board.y + 38 || y > board.y + board.height - 10) return;
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    const progress = distance / total;
    if (progress > route.pacEatsProgress) return null;
    const pacmanAtPellet = timeAtProgress(progress, route.pacKeys, route.pacTimes);
    const consumeAt = Math.max(route.visible[0] + 0.002, pacmanAtPellet + pelletPostContactDelay);
    if (consumeAt >= route.visible[1] - 0.001) return;
    seen.add(key);
    pellets.push({ x, y, consumeAt, distance });
  };

  for (const segment of segments) {
    const segmentEnd = Math.min(segment.start + segment.length, maxDistance);
    if (segmentEnd < segment.start) continue;
    const count = Math.max(1, Math.round((segmentEnd - segment.start) / pelletStep));
    for (let index = 0; index <= count; index += 1) {
      addPellet(segment.start + (segmentEnd - segment.start) * (index / count));
    }
  }

  pellets.sort((left, right) => left.distance - right.distance);
  return pellets;
}

function pointAtDistance(segments, distance) {
  const segment = segments.find((item) => distance <= item.start + item.length) ?? segments.at(-1);
  if (!segment || segment.length === 0) return null;
  const ratio = clamp((distance - segment.start) / segment.length, 0, 1);
  return {
    x: segment.x1 + (segment.x2 - segment.x1) * ratio,
    y: segment.y1 + (segment.y2 - segment.y1) * ratio,
  };
}

function timeAtProgress(progress, keys, times) {
  for (let index = 1; index < keys.length; index += 1) {
    const leftKey = keys[index - 1];
    const rightKey = keys[index];
    if (progress <= rightKey || index === keys.length - 1) {
      if (rightKey === leftKey) return times[index];
      const ratio = Math.max(0, Math.min(1, (progress - leftKey) / (rightKey - leftKey)));
      return times[index - 1] + (times[index] - times[index - 1]) * ratio;
    }
  }
  return times.at(-1);
}

function fmt(value) {
  return Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function animateOpacity(consumeAt) {
  return `<animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" values="1;0;0" keyTimes="0;${fmt(consumeAt)};1" />`;
}

function animateGroupVisibility([start, end]) {
  if (start === 0) {
    return `<animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" values="1;0;0" keyTimes="0;${fmt(end)};1" />`;
  }
  if (end >= 0.995) {
    return `<animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" values="0;1;0" keyTimes="0;${fmt(start)};1" />`;
  }
  return `<animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" values="0;1;0;0" keyTimes="0;${fmt(start)};${fmt(end)};1" />`;
}

function catchSpark(route) {
  if (!route.caught) return '';
  const [x, y] = route.points.at(-1);
  const start = Math.max(route.visible[0], route.catchAt - 0.004);
  const end = route.visible[1];
  const keyTimes = `0;${fmt(start)};${fmt(end)};1`;
  return `<g class="catch-spark" transform="translate(${x} ${y})" opacity="0">
          <animate attributeName="opacity" dur="${duration}s" repeatCount="indefinite" calcMode="discrete" values="0;1;0;0" keyTimes="${keyTimes}" />
          <circle class="catch-ring" r="12">
            <animate attributeName="r" dur="${duration}s" repeatCount="indefinite" values="12;12;31;31" keyTimes="${keyTimes}" />
          </circle>
          <path class="catch-burst" d="M-24 0 H-11 M11 0 H24 M0 -24 V-11 M0 11 V24" />
        </g>`;
}

function animateMotion(route, keys, times, rotate = false) {
  const rotateAttr = rotate ? ' rotate="auto"' : '';
  return `<animateMotion dur="${duration}s" repeatCount="indefinite"${rotateAttr} calcMode="linear" keyPoints="${keys.map(fmt).join(';')}" keyTimes="${times.map(fmt).join(';')}"><mpath href="#route-${route.id}-path" xlink:href="#route-${route.id}-path" /></animateMotion>`;
}

function snake(route) {
  const lags = [0.060, 0.050, 0.040, 0.030, 0.020, 0.010];
  const body = lags.map((lag, index) => {
    const keys = route.snakeKeys.map((key) => Math.max(0, Math.min(1, key - lag)));
    const radius = [5.6, 5.9, 6.2, 6.6, 7.0, 7.4][index];
    const opacity = [0.42, 0.52, 0.62, 0.72, 0.84, 0.96][index];
    return `<g><circle class="snake-body" r="${radius}" opacity="${opacity}" />${animateMotion(route, keys, route.snakeTimes)}</g>`;
  }).join('\n          ');

  const head = `<g>
            <circle class="snake-head" r="9.5" />
            <circle class="snake-eye" cx="3" cy="-3" r="1.6" />
            <circle class="snake-eye" cx="4" cy="3" r="1.6" />
            ${animateMotion(route, route.snakeKeys, route.snakeTimes, true)}
          </g>`;

  return `${body}\n          ${head}`;
}

function pacman(route) {
  return `<g>
            <circle class="pac-body" r="19" />
            <path class="pac-mouth" d="M0 0 L23 -14 A26 26 0 0 1 23 14 Z">
              <animate attributeName="d" dur=".32s" repeatCount="indefinite" values="M0 0 L23 -14 A26 26 0 0 1 23 14 Z;M0 0 L23 -4 A26 26 0 0 1 23 4 Z;M0 0 L23 -14 A26 26 0 0 1 23 14 Z" />
            </path>
            <line class="pac-headlamp" x1="17" y1="0" x2="43" y2="0" />
            ${animateMotion(route, route.pacKeys, route.pacTimes, true)}
          </g>
          <g>
            <circle class="pac-eye" cx="3" cy="-9" r="2.2" />
            ${animateMotion(route, route.pacKeys, route.pacTimes)}
          </g>`;
}

function contributionCells(data) {
  return data.cells.map((cell) => {
    const x = grid.x + cell.col * grid.step;
    const y = grid.y + cell.row * grid.step;
    const title = cell.date ? `<title>${escapeHtml(cell.date)} level ${cell.level}</title>` : '';
    return `<use href="#c${cell.level}" xlink:href="#c${cell.level}" x="${x}" y="${y}">${title}</use>`;
  }).join('\n      ');
}

function monthLabels(data) {
  return data.months
    .filter((month) => month.col < 53)
    .map((month) => `<text class="label" x="${grid.x + month.col * grid.step}" y="128">${escapeHtml(month.name)}</text>`)
    .join('\n    ');
}

function routeMarkup(route) {
  const opacity = route.visible[0] === 0 ? '' : ' opacity="0"';
  const pellets = samplePellets(route).map((pellet) => (
    `<circle class="pellet" cx="${pellet.x}" cy="${pellet.y}" r="${pelletRadius}">${animateOpacity(pellet.consumeAt)}</circle>`
  )).join('\n        ');
  const actors = [
    catchSpark(route),
    snake(route),
    pacman(route),
  ].filter(Boolean).join('\n        ');

  return `<g id="route-${route.id}"${opacity} clip-path="url(#playfield-clip)">
      ${animateGroupVisibility(route.visible)}
      <use href="#route-${route.id}-path" xlink:href="#route-${route.id}-path" class="laser-guide" />

      <g>
        ${pellets}
      </g>

      <g filter="url(#soft-glow)">
        ${actors}
      </g>
    </g>`;
}

function svg(data) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Pac-Man chasing the GitHub contribution snake</title>
  <desc id="desc">A custom ${profile} contribution board with randomized Pac-Man chase routes, normal-spaced pellets, red laser guides, snake escapes, and occasional catches.</desc>
  <metadata>route-seed:${routeSeed}; caught-routes:${routes.filter((route) => route.caught).length}</metadata>

  <defs>
    <style>
      .label { fill: #8b949e; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 13px; }
      .headline { fill: #f0f6fc; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 22px; font-weight: 700; letter-spacing: 0; }
      .subline { fill: #c9d1d9; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; letter-spacing: 0; }
      .chip-text { fill: #f0f6fc; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; }
      .laser-guide { fill: none; stroke: #ff3b30; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: .82; filter: url(#laser-glow); }
      .pellet { fill: #ffffff; }
      .snake-body { fill: #26a641; stroke: #0d1117; stroke-width: 2; }
      .snake-head { fill: #39d353; stroke: #0d1117; stroke-width: 2; }
      .snake-eye { fill: #0d1117; }
      .pac-body { fill: #ffd33d; stroke: #0d1117; stroke-width: 2.2; }
      .pac-mouth { fill: #0d1117; }
      .pac-eye { fill: #0d1117; }
      .pac-headlamp { stroke: #ff3b30; stroke-width: 2; stroke-linecap: round; filter: url(#laser-glow); }
      .catch-ring { fill: none; stroke: #ffd33d; stroke-width: 2; }
      .catch-burst { fill: none; stroke: #f2cc60; stroke-width: 2.4; stroke-linecap: round; }
    </style>

    <filter id="soft-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="laser-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.2" result="laser-blur" />
      <feMerge>
        <feMergeNode in="laser-blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <linearGradient id="board-glow" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0d1117" />
      <stop offset="1" stop-color="#010409" />
    </linearGradient>

    <g id="c0"><rect width="${grid.cell}" height="${grid.cell}" rx="2" fill="#161b22" /></g>
    <g id="c1"><rect width="${grid.cell}" height="${grid.cell}" rx="2" fill="#0e4429" /></g>
    <g id="c2"><rect width="${grid.cell}" height="${grid.cell}" rx="2" fill="#006d32" /></g>
    <g id="c3"><rect width="${grid.cell}" height="${grid.cell}" rx="2" fill="#26a641" /></g>
    <g id="c4"><rect width="${grid.cell}" height="${grid.cell}" rx="2" fill="#39d353" /></g>

    <clipPath id="playfield-clip">
      <rect x="${board.x}" y="${board.y}" width="${board.width}" height="${board.height}" rx="10" />
    </clipPath>

    ${routes.map((route) => `<path id="route-${route.id}-path" d="${pathD(route.points)}" />`).join('\n    ')}
  </defs>

  <rect width="${width}" height="${height}" rx="18" fill="#0d1117" />
  <rect x="18" y="18" width="824" height="294" rx="14" fill="url(#board-glow)" stroke="#30363d" />

  <text class="headline" x="42" y="58">Pac-Man vs. the contribution snake</text>
  <text class="subline" x="42" y="82">${escapeHtml(data.total)} contributions. Pac-Man eats a laser-marked path.</text>

  <g>
    <rect x="${board.x}" y="${board.y}" width="${board.width}" height="${board.height}" rx="10" fill="#010409" stroke="#30363d" />
    ${monthLabels(data)}

    <g id="skunkworks-contribution-array">
      ${contributionCells(data)}
    </g>

    ${routes.map(routeMarkup).join('\n\n    ')}
  </g>

  <g transform="translate(42 262)">
    <rect width="126" height="34" rx="8" fill="#1f6feb" />
    <text class="chip-text" x="16" y="22">interop</text>
  </g>
  <g transform="translate(184 262)">
    <rect width="126" height="34" rx="8" fill="#238636" />
    <text class="chip-text" x="16" y="22">data quality</text>
  </g>
  <g transform="translate(326 262)">
    <rect width="126" height="34" rx="8" fill="#6e40c9" />
    <text class="chip-text" x="16" y="22">clinical ai</text>
  </g>
  <g transform="translate(468 262)">
    <rect width="126" height="34" rx="8" fill="#da3633" />
    <text class="chip-text" x="16" y="22">compliance</text>
  </g>
  <g transform="translate(610 262)">
    <rect width="126" height="34" rx="8" fill="#8957e5" />
    <text class="chip-text" x="16" y="22">cad feeds</text>
  </g>
</svg>
`;
}

let data;
try {
  data = parseContributionData(await fetchContributionHtml());
} catch (error) {
  console.warn(`${error.message}; using fallback contribution grid.`);
  data = fallbackContributionData();
}

await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
await writeFile(outputUrl, svg(data), 'utf8');
console.log(`Generated ${outputUrl.pathname} with route seed ${routeSeed}`);
