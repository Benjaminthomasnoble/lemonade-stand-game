// The clock's speed knob (spec: Clock and speed), and who holds a pause. Speed 0 is a pause: Space, the pause knob,
// a load mid-day or a major alert's auto-pause. Full-screen paper pauses a running clock too (its Options switch),
// and putting the paper away gives the speed back, but only while the paper still holds that pause: anything else
// that pauses or resumes the clock in the meantime takes it over, so a load's pause, an alert's auto-pause or a
// speed picked behind the paper all outlast the paper. The frame loop in src/main.ts turns it; no DOM here.

export interface Knob {
  speed: number; // 0 is a pause
  resumeTo: number; // the speed a resume goes back to
  paper: boolean; // full-screen paper was up last frame
  held: boolean; // ...and it paused the clock, so putting it away gives the speed back
}

export const newKnob = (speed = 1): Knob => ({ speed, resumeTo: 1, paper: false, held: false });

/** Pause, remembering the speed to go back to. The pause is the caller's now, not the paper's. */
export function pauseKnob(k: Knob): void {
  k.held = false;
  if (k.speed) { k.resumeTo = k.speed; k.speed = 0; }
}

/** Run again at the speed before the pause. */
export function resumeKnob(k: Knob): void {
  k.held = false;
  if (!k.speed) k.speed = k.resumeTo || 1;
}

/** A speed picked (1-3); 0 pauses. */
export function setKnob(k: Knob, v: number): void {
  if (v <= 0) { pauseKnob(k); return; }
  k.held = false;
  k.speed = v;
}

/**
 * Each frame: is full-screen paper up, and may it pause the clock now (its switch on, business hours or the night)?
 * Paper going up over a running clock pauses it and holds that pause; coming down while it still holds it resumes.
 * True when it gave the speed back.
 */
export function paperKnob(k: Knob, up: boolean, mayPause: boolean): boolean {
  if (up === k.paper) return false;
  k.paper = up;
  if (up) {
    if (k.speed && mayPause) { pauseKnob(k); k.held = true; }
    return false;
  }
  if (!k.held) return false;
  resumeKnob(k);
  return true;
}
