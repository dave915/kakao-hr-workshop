export interface MenuSwipePoint {
  id: number;
  x: number;
  y: number;
}

/** Direction locks before activation so a vertical scroll cannot become a menu swipe. */
export function createMobileMenuSwipe() {
  let start: MenuSwipePoint | null = null;
  let horizontal = false;
  const cancel = () => {
    start = null;
    horizontal = false;
  };
  const move = (point: MenuSwipePoint) => {
    if (!start || point.id !== start.id) {
      cancel();
      return false;
    }
    const dx = point.x - start.x,
      dy = Math.abs(point.y - start.y);
    if (!horizontal) {
      if (dx < -12 || (dy > 12 && dy > Math.abs(dx) * 0.75)) {
        cancel();
        return false;
      }
      horizontal = dx >= 12 && dx > dy * 1.5;
    }
    return horizontal;
  };
  return {
    begin(point: MenuSwipePoint) {
      start = point;
      horizontal = false;
    },
    move,
    end(point: MenuSwipePoint) {
      const moved = move(point);
      const activate = Boolean(
        moved &&
        start &&
        point.x - start.x >= 72 &&
        point.x - start.x > Math.abs(point.y - start.y) * 1.5,
      );
      cancel();
      return activate;
    },
    cancel,
  };
}
