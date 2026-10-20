const KEYS = {
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

const SWIPE = 24;

const isControl = (target) => Boolean(target)
  && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT' || target.isContentEditable === true);

export function bindInput({ canvas, onDirection, onPrimary, onRestart, onMute }) {
  const keydown = (event) => {
    if (event.repeat) return;

    const dir = KEYS[event.key.toLowerCase()];
    if (dir) {
      event.preventDefault();
      onDirection(dir);
      return;
    }

    if (event.code === 'Space') {
      if (isControl(event.target)) return;
      event.preventDefault();
      onPrimary();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      onRestart();
    } else if (key === 'm') {
      event.preventDefault();
      onMute();
    }
  };

  let x0 = 0;
  let y0 = 0;
  let tracing = false;

  const touchStart = (event) => {
    const touch = event.changedTouches[0];
    x0 = touch.clientX;
    y0 = touch.clientY;
    tracing = true;
  };

  const touchEnd = (event) => {
    if (!tracing) return;
    tracing = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    if (Math.abs(dx) > Math.abs(dy)) onDirection(dx > 0 ? 'right' : 'left');
    else onDirection(dy > 0 ? 'down' : 'up');
  };

  const block = (event) => event.preventDefault();

  window.addEventListener('keydown', keydown);
  canvas.addEventListener('touchstart', touchStart, { passive: true });
  canvas.addEventListener('touchend', touchEnd, { passive: true });
  canvas.addEventListener('touchmove', block, { passive: false });

  return () => {
    window.removeEventListener('keydown', keydown);
    canvas.removeEventListener('touchstart', touchStart);
    canvas.removeEventListener('touchend', touchEnd);
    canvas.removeEventListener('touchmove', block);
  };
}
