import { useCallback, useEffect, useRef, useState } from 'react';

export const TRACKING_STATES = Object.freeze({
  CLOCKED_OUT: 'CLOCKED_OUT',
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  ON_BREAK: 'ON_BREAK'
});

function stateFromSession(session) {
  if (!session?.clockIn || session.clockOut) return TRACKING_STATES.CLOCKED_OUT;
  if (session.state === TRACKING_STATES.ON_BREAK) return TRACKING_STATES.ON_BREAK;
  return session.state === TRACKING_STATES.IDLE ? TRACKING_STATES.IDLE : TRACKING_STATES.ACTIVE;
}

function pointFromEvent(event) {
  if (event.type === 'touchstart') {
    const touch = event.touches[0];
    return touch ? { x: touch.clientX, y: touch.clientY, eventType: 'touch' } : null;
  }
  if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null;
  return { x: event.clientX, y: event.clientY, eventType: 'pointer' };
}

/**
 * Browser-only activity sampler. It records trusted interaction metadata, never
 * keystroke values, DOM content, screenshots, or browser activity outside this
 * portal tab. Listener installation follows the explicit work-session state.
 */
export function useActivityTracker({ session, config, onHeartbeat }) {
  const [state, setState] = useState(() => stateFromSession(session));
  const stateRef = useRef(state);
  const sessionIdRef = useRef(session?.id ?? null);
  const lastInteractionRef = useRef(Date.now());
  const lastEventRef = useRef(0);
  const lastHeartbeatRef = useRef(Date.now());
  const coordinatesRef = useRef([]);
  const countsRef = useRef({ mouseClicks: 0, keypresses: 0 });
  const sendingRef = useRef(false);
  const onHeartbeatRef = useRef(onHeartbeat);
  onHeartbeatRef.current = onHeartbeat;

  const idleAfterMs = Math.max(60, config?.idleAfterSeconds ?? 300) * 1000;
  const heartbeatEveryMs = Math.max(10, config?.heartbeatEverySeconds ?? 30) * 1000;
  const trackingEnabled = Boolean(session?.id) && (state === TRACKING_STATES.ACTIVE || state === TRACKING_STATES.IDLE);

  const transition = useCallback((nextState) => {
    if (stateRef.current === nextState) return;
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const flushHeartbeat = useCallback(async (overrideState) => {
    if (!sessionIdRef.current || sendingRef.current) return;
    const mode = overrideState ?? stateRef.current;
    if (mode !== TRACKING_STATES.ACTIVE && mode !== TRACKING_STATES.IDLE) return;

    const now = Date.now();
    const durationSeconds = Math.min(180, Math.max(0, Math.floor((now - lastHeartbeatRef.current) / 1000)));
    const coordinates = coordinatesRef.current.splice(0, coordinatesRef.current.length);
    const counts = { ...countsRef.current };
    countsRef.current = { mouseClicks: 0, keypresses: 0 };
    lastHeartbeatRef.current = now;
    if (!durationSeconds && !coordinates.length && !counts.mouseClicks && !counts.keypresses) return;

    sendingRef.current = true;
    try {
      await onHeartbeatRef.current({
        state: mode,
        durationSeconds,
        mouseClicks: counts.mouseClicks,
        keypresses: counts.keypresses,
        pageHidden: document.hidden,
        coordinates
      });
    } catch {
      // A later heartbeat retries naturally. UI operations surface their own
      // API errors so background telemetry never interrupts an employee.
    } finally {
      sendingRef.current = false;
    }
  }, []);

  // Authoritative session data from the backend wins after every control action.
  useEffect(() => {
    const next = stateFromSession(session);
    const changedSession = sessionIdRef.current !== (session?.id ?? null);
    sessionIdRef.current = session?.id ?? null;
    if (changedSession || next === TRACKING_STATES.CLOCKED_OUT || next === TRACKING_STATES.ON_BREAK) {
      coordinatesRef.current = [];
      countsRef.current = { mouseClicks: 0, keypresses: 0 };
      lastInteractionRef.current = Date.now();
      lastHeartbeatRef.current = Date.now();
    }
    stateRef.current = next;
    setState(next);
  }, [session, session?.clockIn, session?.clockOut, session?.id, session?.state]);

  useEffect(() => {
    if (!trackingEnabled) return undefined;

    const processTrustedEvent = (event) => {
      if (!event.isTrusted || document.hidden) return;
      const now = Date.now();
      // Throttle all event processing to one sample every three seconds.
      if (now - lastEventRef.current < 3_000) return;
      lastEventRef.current = now;
      if (stateRef.current === TRACKING_STATES.IDLE) {
        void flushHeartbeat(TRACKING_STATES.IDLE);
        transition(TRACKING_STATES.ACTIVE);
      }
      lastInteractionRef.current = now;
      if (event.type === 'mousedown') countsRef.current.mouseClicks += 1;
      if (event.type === 'keydown') countsRef.current.keypresses += 1;
      const point = pointFromEvent(event);
      if (point && coordinatesRef.current.length < 12) coordinatesRef.current.push({ ...point, timestamp: new Date(now).toISOString() });
    };

    const onVisibilityChange = () => {
      if (document.hidden && stateRef.current === TRACKING_STATES.ACTIVE) {
        void flushHeartbeat(TRACKING_STATES.ACTIVE);
        transition(TRACKING_STATES.IDLE);
      }
      if (!document.hidden && stateRef.current === TRACKING_STATES.IDLE) {
        void flushHeartbeat(TRACKING_STATES.IDLE);
        lastInteractionRef.current = Date.now();
        transition(TRACKING_STATES.ACTIVE);
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, processTrustedEvent, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, processTrustedEvent));
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flushHeartbeat, trackingEnabled, transition]);

  useEffect(() => {
    if (!trackingEnabled) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!document.hidden && stateRef.current === TRACKING_STATES.ACTIVE && now - lastInteractionRef.current >= idleAfterMs) {
        void flushHeartbeat(TRACKING_STATES.ACTIVE);
        transition(TRACKING_STATES.IDLE);
        return;
      }
      if (now - lastHeartbeatRef.current >= heartbeatEveryMs) void flushHeartbeat();
    }, Math.min(heartbeatEveryMs, 10_000));
    return () => window.clearInterval(timer);
  }, [flushHeartbeat, heartbeatEveryMs, idleAfterMs, trackingEnabled, transition]);

  const pauseForBreak = useCallback(() => transition(TRACKING_STATES.ON_BREAK), [transition]);
  const restoreSessionState = useCallback(() => transition(stateFromSession(session)), [session, transition]);

  return { state, trackingEnabled, pauseForBreak, restoreSessionState };
}
