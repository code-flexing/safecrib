export type BookingStatus =
  | 'AVAILABLE'
  | 'HELD'
  | 'BOOKED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED';

export interface BookingState {
  id: string;
  listingId: string;
  status: BookingStatus;
  holdExpiresAt?: Date | null;
  depositAmount: number;
}

export class IllegalStateTransitionError extends Error {
  constructor(
    public readonly currentState: BookingStatus,
    public readonly targetState: BookingStatus,
  ) {
    super(
      `Cannot transition from ${currentState} to ${targetState}`,
    );
    this.name = 'IllegalStateTransitionError';
  }
}

type Transition = (
  current: BookingState,
  target: BookingStatus,
  context?: Record<string, unknown>,
) => BookingState;

const TRANSITIONS: Record<string, Transition[]> = {
  AVAILABLE: [
    (state, _t, ctx) => ({
      ...state,
      status: 'HELD',
      holdExpiresAt: ctx?.holdExpiresAt as Date,
      depositAmount: (ctx?.depositAmount as number) ?? state.depositAmount,
    }),
  ],
  HELD: [
    (state, _t, ctx) => ({
      ...state,
      status: 'BOOKED',
      holdExpiresAt: null,
      bookedAt: ctx?.bookedAt as Date,
    }),
    (state, _t) => ({
      ...state,
      status: 'AVAILABLE',
      holdExpiresAt: null,
    }),
    (state, _t) => ({
      ...state,
      status: 'CANCELLED',
      holdExpiresAt: null,
    }),
  ],
  BOOKED: [
    (state, _t, ctx) => ({
      ...state,
      status: 'COMPLETED',
      completedAt: ctx?.completedAt as Date,
    }),
    (state, _t) => ({ ...state, status: 'DISPUTED' }),
    (state, _t) => ({ ...state, status: 'CANCELLED' }),
  ],
  COMPLETED: [],
  DISPUTED: [
    (state, _t) => ({ ...state, status: 'COMPLETED' }),
    (state, _t) => ({ ...state, status: 'CANCELLED' }),
  ],
  CANCELLED: [],
};

export function applyTransition(
  current: BookingState,
  target: BookingStatus,
  context?: Record<string, unknown>,
): BookingState {
  const handlers = TRANSITIONS[current.status];
  if (!handlers) {
    throw new IllegalStateTransitionError(current.status, target);
  }

  const handler = handlers.find((h) => {
    const result = h(current, target, context);
    return result.status === target;
  });

  if (!handler) {
    throw new IllegalStateTransitionError(current.status, target);
  }

  return handler(current, target, context);
}

export function canTransition(
  current: BookingStatus,
  target: BookingStatus,
): boolean {
  const allowed = getAllowedTransitions(current);
  return allowed.includes(target);
}

function getAllowedTransitions(status: BookingStatus): BookingStatus[] {
  const handlers = TRANSITIONS[status] || [];
  return handlers.map((h) => {
    const result = h({} as BookingState, {} as BookingStatus);
    return result.status;
  });
}

export interface BookingStateMachine {
  hold: (depositAmount: number, holdExpiresAt: Date) => BookingState;
  confirm: (bookedAt: Date) => BookingState;
  release: () => BookingState;
  cancel: () => BookingState;
  complete: (completedAt: Date) => BookingState;
  dispute: () => BookingState;
}

export function createBookingStateMachine(
  initial: Omit<BookingState, 'status'>,
): {
  state: BookingState;
  hold: (depositAmount: number, holdExpiresAt: Date) => void;
  confirm: (bookedAt: Date) => void;
  release: () => void;
  cancel: () => void;
  complete: (completedAt: Date) => void;
  dispute: () => void;
} {
  let state: BookingState = { ...initial, status: 'AVAILABLE' };

  return {
    get state() {
      return state;
    },
    hold(depositAmount: number, holdExpiresAt: Date) {
      state = applyTransition(state, 'HELD', { depositAmount, holdExpiresAt });
    },
    confirm(bookedAt: Date) {
      state = applyTransition(state, 'BOOKED', { bookedAt });
    },
    release() {
      state = applyTransition(state, 'AVAILABLE');
    },
    cancel() {
      state = applyTransition(state, 'CANCELLED');
    },
    complete(completedAt: Date) {
      state = applyTransition(state, 'COMPLETED', { completedAt });
    },
    dispute() {
      state = applyTransition(state, 'DISPUTED');
    },
  };
}
