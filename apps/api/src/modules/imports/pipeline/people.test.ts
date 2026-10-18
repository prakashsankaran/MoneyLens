import { describe, expect, it } from 'vitest';
import { looksLikePerson, personalUpiId } from './people';

describe('personalUpiId', () => {
  it('accepts names and phone numbers', () => {
    expect(personalUpiId('arjun.mehta@okhdfcbank')).toBe(true);
    expect(personalUpiId('9876543210@ybl')).toBe(true);
    expect(personalUpiId('meera12@okaxis')).toBe(true);
  });

  it('rejects shop QR codes and gateways', () => {
    expect(personalUpiId('paytmqr2810050501011abcd@paytm')).toBe(false);
    expect(personalUpiId('q123456789@ybl')).toBe(false);
    expect(personalUpiId('bharatpe.9000012345@icici')).toBe(false);
    expect(personalUpiId('razorpay.swiggy@icici')).toBe(false);
    expect(personalUpiId(null)).toBe(false);
  });
});

describe('looksLikePerson', () => {
  it('accepts two to four word names', () => {
    expect(looksLikePerson('Arjun Mehta')).toBe(true);
    expect(looksLikePerson('Ravi Kumar', 'ravikumar@okaxis')).toBe(true);
    expect(looksLikePerson('S. Lakshmi Narayanan')).toBe(true);
  });

  it('needs a personal UPI ID for a one-word name', () => {
    expect(looksLikePerson('Meera')).toBe(false);
    expect(looksLikePerson('Meera', 'meera@ybl')).toBe(true);
  });

  it('rejects businesses', () => {
    expect(looksLikePerson('Sri Krishna Stores')).toBe(false);
    expect(looksLikePerson('Vegetable Market')).toBe(false);
    expect(looksLikePerson('Meghana Foods')).toBe(false);
    expect(looksLikePerson('Ravi Kumar', 'paytmqr281005050101@paytm')).toBe(false);
    expect(looksLikePerson('Store 42')).toBe(false);
    expect(looksLikePerson('Sri Lakshmi General', 'lakshmigeneral@okaxis')).toBe(false);
    expect(looksLikePerson('Zorble Gadgets', 'zorble@icici')).toBe(false);
    expect(looksLikePerson('Nimbus Learning', 'nimbus@hdfcbank')).toBe(false);
    expect(looksLikePerson('Shree Balaji Tiffins')).toBe(false);
    expect(looksLikePerson('A B C D E')).toBe(false);
  });
});
