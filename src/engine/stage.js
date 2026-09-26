// Stage: the logical 1440 x 1000 play area, scaled to fit the screen and
// centered (docs/design.md section 6.3). This is the P1.1 minimum; P1.5 adds
// the art bleed, camera panning and screen<->world conversion.

export const STAGE_W = 1440;
export const STAGE_H = 1000;

/** Scale and offset that fit the stage inside a vw x vh viewport. Pure. */
export function fitStage(vw, vh) {
  const s = Math.min(vw / STAGE_W, vh / STAGE_H);
  return { s, x: (vw - STAGE_W * s) / 2, y: (vh - STAGE_H * s) / 2 };
}

/** Create the stage element inside `host` and keep it fitted on resize. */
export function createStage(host) {
  const el = document.createElement('div');
  el.className = 'stage';
  host.appendChild(el);

  const stage = { el, s: 1, x: 0, y: 0 };
  function layout() {
    const fit = fitStage(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    stage.s = fit.s;
    stage.x = fit.x;
    stage.y = fit.y;
    el.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})`;
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  stage.layout = layout;
  return stage;
}
