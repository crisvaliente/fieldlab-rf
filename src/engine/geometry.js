export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function orient(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
function onSeg(ax, ay, bx, by, px, py, eps) {
  return px >= Math.min(ax, bx) - eps && px <= Math.max(ax, bx) + eps &&
         py >= Math.min(ay, by) - eps && py <= Math.max(ay, by) + eps;
}

/** ¿El segmento p1-p2 corta al segmento p3-p4? Tocar un extremo cuenta como corte. */
export function segmentsIntersect(p1, p2, p3, p4, eps = 1e-9) {
  const d1 = orient(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
  const d2 = orient(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
  const d3 = orient(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  const d4 = orient(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
      ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true;
  if (Math.abs(d1) <= eps && onSeg(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y, eps)) return true;
  if (Math.abs(d2) <= eps && onSeg(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y, eps)) return true;
  if (Math.abs(d3) <= eps && onSeg(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, eps)) return true;
  if (Math.abs(d4) <= eps && onSeg(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y, eps)) return true;
  return false;
}

/** Distancia de un punto a un segmento (para selección en el plano). */
export function pointSegmentDistance(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
