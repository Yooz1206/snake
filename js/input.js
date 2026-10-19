const KEY_TO_DIRECTION = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

const SWIPE_THRESHOLD = 24;

/**
 * Wire keyboard, pointer and swipe input to game actions.
 * Returns a cleanup function.
 *
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   onDirection: (direction: string) => void,
 *   onPrimary: () => void,
 *   onRestart: () => void,
 *   onMute: () => void,
 * }} handlers
 */
export function bindInput({ canvas, onDirection, onPrimary, onRestart, onMute }) {
  const handleKeyDown = (event) => {
    if (event.repeat) return;

    const direction = KEY_TO_DIRECTION[event.key.toLowerCase()];
    if (direction) {
      event.preventDefault();
      onDirection(direction);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      onPrimary();
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      onRestart();
      return;
    }

    if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      onMute();
    }
  };

  let startX = 0;
  let startY = 0;
  let tracking = false;

  const handleTouchStart = (event) => {
    const touch = event.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  };

  const handleTouchEnd = (event) => {
    if (!tracking) return;
    tracking = false;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      onDirection(dx > 0 ? 'right' : 'left');
    } else {
      onDirection(dy > 0 ? 'down' : 'up');
    }
  };

  const blockScroll = (event) => event.preventDefault();

  window.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
  canvas.addEventListener('touchmove', blockScroll, { passive: false });

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchend', handleTouchEnd);
    canvas.removeEventListener('touchmove', blockScroll);
  };
}
