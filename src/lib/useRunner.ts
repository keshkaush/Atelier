import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildScript,
  DESKS,
  type Beat,
  type Deliverable,
  type DeskId,
  type Phase,
  type Who,
} from './studio';

export interface LogLine {
  key: number;
  t: string;
  who: Who;
  msg: string;
  done: boolean;
}

export interface DeskState {
  phase: Phase;
  now: string;
  artifact?: { title: string; body: string };
}

type DeskMap = Record<DeskId, DeskState>;

const freshDesks = (): DeskMap => {
  const m = {} as DeskMap;
  for (const d of DESKS) m[d.id] = { phase: 'queued', now: '' };
  return m;
};

export type RunnerStatus = 'idle' | 'running' | 'complete';

export interface Runner {
  status: RunnerStatus;
  leadNow: string;
  leadPhase: Phase;
  desks: DeskMap;
  log: LogLine[];
  progress: number;
  elapsed: number;
  /** The assembled result — only set once the run completes. */
  deliverable: Deliverable | null;
  start: (brief: string) => void;
  reset: () => void;
}

const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Walks the scripted run timeline on timers. Speed is tunable so the
 * demo reads as live without making the user wait minutes.
 */
export function useRunner(speedMs = 620): Runner {
  const [status, setStatus] = useState<RunnerStatus>('idle');
  const [leadNow, setLeadNow] = useState('');
  const [leadPhase, setLeadPhase] = useState<Phase>('queued');
  const [desks, setDesks] = useState<DeskMap>(freshDesks);
  const [log, setLog] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null);

  const beatsRef = useRef<Beat[]>([]);
  const deliverableRef = useRef<Deliverable | null>(null);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAt = useRef(0);
  const lineKey = useRef(0);

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    timerRef.current = null;
    clockRef.current = null;
  };

  const reset = useCallback(() => {
    clearTimers();
    beatsRef.current = [];
    deliverableRef.current = null;
    idxRef.current = 0;
    lineKey.current = 0;
    setStatus('idle');
    setLeadNow('');
    setLeadPhase('queued');
    setDesks(freshDesks());
    setLog([]);
    setProgress(0);
    setElapsed(0);
    setDeliverable(null);
  }, []);

  const start = useCallback(
    (brief: string) => {
      clearTimers();
      // The brief is the input to the script, not a label attached after
      // the fact — this is what makes two briefs produce two runs.
      const script = buildScript(brief);
      beatsRef.current = script.beats;
      deliverableRef.current = script.deliverable;
      idxRef.current = 0;
      lineKey.current = 0;
      setStatus('running');
      setLeadNow('');
      setLeadPhase('queued');
      setDesks(freshDesks());
      setLog([]);
      setProgress(0);
      setElapsed(0);
      setDeliverable(null);
      startAt.current = Date.now();

      clockRef.current = setInterval(() => {
        setElapsed(Date.now() - startAt.current);
      }, 250);

      const step = () => {
        const i = idxRef.current;
        const beats = beatsRef.current;
        if (i >= beats.length) {
          clearTimers();
          setStatus('complete');
          setProgress(100);
          setElapsed(Date.now() - startAt.current);
          // Only now is there something to assemble — the log line that
          // says "deliverables assembled" is finally true.
          setDeliverable(deliverableRef.current);
          return;
        }
        const beat = beats[i];
        const t = fmtClock(Date.now() - startAt.current);

        // Append to the log.
        setLog((prev) => [
          ...prev,
          {
            key: lineKey.current++,
            t,
            who: beat.who,
            msg: beat.msg,
            done: beat.phase === 'done',
          },
        ]);

        // Apply the beat to state.
        if (beat.who === 'lead') {
          setLeadNow(beat.msg);
          if (beat.phase) setLeadPhase(beat.phase);
        } else if (beat.who !== 'studio') {
          const id = beat.who as DeskId;
          setDesks((prev) => ({
            ...prev,
            [id]: {
              phase: beat.phase ?? prev[id].phase,
              now: beat.msg,
              artifact: beat.artifact ?? prev[id].artifact,
            },
          }));
        }

        idxRef.current = i + 1;
        setProgress(Math.round(((i + 1) / beats.length) * 100));
        timerRef.current = setTimeout(step, speedMs);
      };

      // small opening pause so the first line lands after paint
      timerRef.current = setTimeout(step, 260);
    },
    [speedMs],
  );

  useEffect(() => () => clearTimers(), []);

  return {
    status,
    leadNow,
    leadPhase,
    desks,
    log,
    progress,
    elapsed,
    deliverable,
    start,
    reset,
  };
}
