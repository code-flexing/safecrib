export type {
  BookingStatus,
  BookingState,
  IllegalStateTransitionError,
  BookingStateMachine,
} from './booking-state-machine.js';
export {
  applyTransition,
  canTransition,
  createBookingStateMachine,
} from './booking-state-machine.js';
