import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  canTransition,
  createBookingStateMachine,
  IllegalStateTransitionError,
} from './booking-state-machine.js';
import type { BookingState } from './booking-state-machine.js';

const baseState: BookingState = {
  id: 'booking-1',
  listingId: 'listing-1',
  status: 'AVAILABLE',
  holdExpiresAt: null,
  depositAmount: 0,
};

const now = new Date('2026-01-01T00:00:00Z');

describe('booking-state-machine', () => {
  describe('canTransition', () => {
    it('allows AVAILABLE -> HELD', () => {
      expect(canTransition('AVAILABLE', 'HELD')).toBe(true);
    });

    it('allows HELD -> BOOKED', () => {
      expect(canTransition('HELD', 'BOOKED')).toBe(true);
    });

    it('allows HELD -> AVAILABLE (release)', () => {
      expect(canTransition('HELD', 'AVAILABLE')).toBe(true);
    });

    it('allows HELD -> CANCELLED', () => {
      expect(canTransition('HELD', 'CANCELLED')).toBe(true);
    });

    it('allows BOOKED -> COMPLETED', () => {
      expect(canTransition('BOOKED', 'COMPLETED')).toBe(true);
    });

    it('allows BOOKED -> DISPUTED', () => {
      expect(canTransition('BOOKED', 'DISPUTED')).toBe(true);
    });

    it('does not allow AVAILABLE -> BOOKED (must hold first)', () => {
      expect(canTransition('AVAILABLE', 'BOOKED')).toBe(false);
    });

    it('does not allow COMPLETED -> anything', () => {
      expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
      expect(canTransition('COMPLETED', 'HELD')).toBe(false);
    });

    it('does not allow CANCELLED -> anything', () => {
      expect(canTransition('CANCELLED', 'HELD')).toBe(false);
      expect(canTransition('CANCELLED', 'COMPLETED')).toBe(false);
    });

    it('does not allow DISPUTED -> HELD', () => {
      expect(canTransition('DISPUTED', 'HELD')).toBe(false);
    });
  });

  describe('applyTransition', () => {
    it('transitions AVAILABLE -> HELD with hold expiry', () => {
      const result = applyTransition(baseState, 'HELD', {
        holdExpiresAt: now,
        depositAmount: 5000,
      });
      expect(result.status).toBe('HELD');
      expect(result.holdExpiresAt).toBe(now);
      expect(result.depositAmount).toBe(5000);
    });

    it('transitions HELD -> BOOKED', () => {
      const held: BookingState = { ...baseState, status: 'HELD', holdExpiresAt: now };
      const result = applyTransition(held, 'BOOKED', { bookedAt: now });
      expect(result.status).toBe('BOOKED');
      expect(result.holdExpiresAt).toBeNull();
    });

    it('transitions HELD -> AVAILABLE (expired/cancelled hold)', () => {
      const held: BookingState = { ...baseState, status: 'HELD', holdExpiresAt: now };
      const result = applyTransition(held, 'AVAILABLE');
      expect(result.status).toBe('AVAILABLE');
      expect(result.holdExpiresAt).toBeNull();
    });

    it('throws on illegal transition AVAILABLE -> BOOKED', () => {
      expect(() => applyTransition(baseState, 'BOOKED')).toThrow(
        IllegalStateTransitionError,
      );
    });

    it('throws on illegal transition COMPLETED -> HELD', () => {
      const completed: BookingState = { ...baseState, status: 'COMPLETED' };
      expect(() => applyTransition(completed, 'HELD')).toThrow(
        IllegalStateTransitionError,
      );
    });

    it('throws on illegal transition CANCELLED -> BOOKED', () => {
      const cancelled: BookingState = { ...baseState, status: 'CANCELLED' };
      expect(() => applyTransition(cancelled, 'BOOKED')).toThrow(
        IllegalStateTransitionError,
      );
    });

    it('throws on illegal transition DISPUTED -> HELD', () => {
      const disputed: BookingState = { ...baseState, status: 'DISPUTED' };
      expect(() => applyTransition(disputed, 'HELD')).toThrow(
        IllegalStateTransitionError,
      );
    });

    it('transitions BOOKED -> COMPLETED', () => {
      const booked: BookingState = { ...baseState, status: 'BOOKED' };
      const result = applyTransition(booked, 'COMPLETED', { completedAt: now });
      expect(result.status).toBe('COMPLETED');
    });

    it('transitions BOOKED -> DISPUTED', () => {
      const booked: BookingState = { ...baseState, status: 'BOOKED' };
      const result = applyTransition(booked, 'DISPUTED');
      expect(result.status).toBe('DISPUTED');
    });

    it('transitions DISPUTED -> COMPLETED', () => {
      const disputed: BookingState = { ...baseState, status: 'DISPUTED' };
      const result = applyTransition(disputed, 'COMPLETED', { completedAt: now });
      expect(result.status).toBe('COMPLETED');
    });

    it('transitions DISPUTED -> CANCELLED', () => {
      const disputed: BookingState = { ...baseState, status: 'DISPUTED' };
      const result = applyTransition(disputed, 'CANCELLED');
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('createBookingStateMachine', () => {
    it('starts in AVAILABLE state', () => {
      const sm = createBookingStateMachine({
        id: 'b1',
        listingId: 'l1',
        depositAmount: 0,
        holdExpiresAt: null,
      });
      expect(sm.state.status).toBe('AVAILABLE');
    });

    it('holds then confirms a booking', () => {
      const sm = createBookingStateMachine({
        id: 'b1',
        listingId: 'l1',
        depositAmount: 0,
        holdExpiresAt: null,
      });

      sm.hold(5000, new Date(Date.now() + 3600000));
      expect(sm.state.status).toBe('HELD');

      sm.confirm(new Date());
      expect(sm.state.status).toBe('BOOKED');
    });

    it('holds then releases', () => {
      const sm = createBookingStateMachine({
        id: 'b1',
        listingId: 'l1',
        depositAmount: 0,
        holdExpiresAt: null,
      });

      sm.hold(5000, new Date(Date.now() + 3600000));
      sm.release();
      expect(sm.state.status).toBe('AVAILABLE');
    });

    it('throws if confirming without holding first', () => {
      const sm = createBookingStateMachine({
        id: 'b1',
        listingId: 'l1',
        depositAmount: 0,
        holdExpiresAt: null,
      });
      expect(() => sm.confirm(new Date())).toThrow(IllegalStateTransitionError);
    });

    it('throws if completing without booking first', () => {
      const sm = createBookingStateMachine({
        id: 'b1',
        listingId: 'l1',
        depositAmount: 0,
        holdExpiresAt: null,
      });
      expect(() => sm.complete(new Date())).toThrow(IllegalStateTransitionError);
    });
  });

  describe('concurrent hold invariant', () => {
    it('only one HELD/BOOKED booking can exist for a listing at a time', () => {
      const held1 = applyTransition(baseState, 'HELD', {
        holdExpiresAt: new Date(Date.now() + 3600000),
        depositAmount: 5000,
      });
      expect(held1.status).toBe('HELD');

      expect(() =>
        applyTransition(held1, 'BOOKED', { bookedAt: now }),
      ).not.toThrow();

      const otherListing = { ...baseState, id: 'booking-2' };
      const held2 = applyTransition(otherListing, 'HELD', {
        holdExpiresAt: new Date(Date.now() + 3600000),
        depositAmount: 3000,
      });
      expect(held2.status).toBe('HELD');
    });
  });
});
