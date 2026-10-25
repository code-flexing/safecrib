export type EscrowState =
  | 'HELD'
  | 'PROOF_SUBMITTED'
  | 'RELEASE_PENDING'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'PAYOUT_FAILED';

const transitions: Record<EscrowState, EscrowState[]> = {
  HELD: ['PROOF_SUBMITTED', 'DISPUTED', 'REFUND_PENDING'],
  PROOF_SUBMITTED: ['DISPUTED', 'RELEASE_PENDING', 'REFUND_PENDING'],
  RELEASE_PENDING: ['RELEASED', 'PAYOUT_FAILED'],
  RELEASED: [],
  DISPUTED: ['RELEASE_PENDING', 'REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  REFUNDED: [],
  PAYOUT_FAILED: ['RELEASE_PENDING'],
};

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: EscrowState, to: EscrowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid escrow transition ${from} -> ${to}`);
  }
}
