import { describe, expect, it } from 'vitest';
import { extractMerchantText, findKnownMerchant, merchantKey, toDisplayName } from './merchants';

describe('extractMerchantText', () => {
  it.each([
    ['UPI/412345678901/SWIGGY/swiggy@icici/Payment', 'SWIGGY'],
    ['UPI-SWIGGY-swiggy.demo@icici-ICIC0000001-424698765432-PAYMENT FROM PHONE', 'SWIGGY'],
    ['POS 4321XXXXXXXX9876 STARBUCKS COFFEE', 'STARBUCKS COFFEE'],
    ['SWIGGY*FOOD', 'SWIGGY'],
    ['NEFT CR-NORTHWIND TECHNOLOGIES PVT LTD-SALARY SEP', 'NORTHWIND TECHNOLOGIES PVT LTD'],
    ['Meghana Foods Koramangala', 'MEGHANA FOODS KORAMANGALA'],
    ['Paid to Sri Ganesh Stores', 'SRI GANESH STORES'],
    ['Received from Arjun Mehta', 'ARJUN MEHTA'],
  ])('%s -> %s', (raw, expected) => {
    expect(extractMerchantText(raw)).toBe(expected);
  });
});

describe('merchantKey', () => {
  it('maps spelling variants to one key', () => {
    expect(merchantKey('Swiggy India')).toBe('SWIGGY');
    expect(merchantKey('SWIGGY')).toBe('SWIGGY');
    expect(merchantKey('swiggy pvt. ltd.')).toBe('SWIGGY');
  });
  it('only strips trailing legal words', () => {
    expect(merchantKey('Bread In Box')).toBe('BREAD IN BOX');
    expect(merchantKey('India Gate Foods')).toBe('INDIA GATE FOODS');
  });
  it('never returns an empty key', () => {
    expect(merchantKey('India')).toBe('INDIA');
  });
});

describe('findKnownMerchant', () => {
  it.each([
    ['SWIGGY', 'Swiggy'],
    ['AMZN MKTP', 'Amazon'],
    ['ANI TECHNOLOGIES', 'Ola'],
    ['AVENUE SUPERMARTS', 'DMart'],
    ['RELIANCE DIGITAL', 'Reliance Digital'],
    ['RELIANCE SMART', 'Reliance Smart'],
  ])('%s is %s', (key, name) => {
    expect(findKnownMerchant(key)?.name).toBe(name);
  });
  it('does not match substrings of other words', () => {
    expect(findKnownMerchant('COLA HOUSE')).toBeNull();
  });
});

describe('toDisplayName', () => {
  it('title-cases', () => {
    expect(toDisplayName('MEGHANA  FOODS')).toBe('Meghana Foods');
  });
});
