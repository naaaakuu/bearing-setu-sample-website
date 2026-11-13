// Money helpers. All arithmetic is done in integer paise (1 rupee = 100 paise) and only
// converted to rupees (2 decimals) for output, so floating point drift cannot creep in.

export const toPaise = (rupees) => Math.round(rupees * 100);
export const fromPaise = (paise) => paise / 100;

/** round(a * b / d) for non-negative integers, half rounds up, using BigInt so nothing overflows. */
export function mulDivRound(a, b, d) {
  const A = BigInt(a);
  const B = BigInt(b);
  const D = BigInt(d);
  return Number((A * B * 2n + D) / (2n * D));
}

/**
 * IGST is charged when the buyer is in a different state from the seller. If the seller state code is
 * not configured, or the buyer state is unknown, we use IGST (the total tax is the same, only the split differs).
 */
export function gstTypeFor(buyerStateCode, businessStateCode) {
  if (!businessStateCode || !buyerStateCode) return 'IGST';
  return buyerStateCode === businessStateCode ? 'CGST+SGST' : 'IGST';
}

/**
 * lines: [{ unitPaise, qty }]. freightPaise: integer. gstRate: percent (e.g. 18 or 12.5).
 * GST is charged on goods plus freight. Returns amounts in rupees.
 */
export function computeTotals({ lines, freightPaise = 0, gstRate, gstType }) {
  const subtotalP = lines.reduce((sum, l) => sum + l.unitPaise * l.qty, 0);
  if (!Number.isSafeInteger(subtotalP) || subtotalP > 1e13) throw new RangeError('order total too large');
  const taxableP = subtotalP + freightPaise;
  const rateBp = Math.round(gstRate * 100); // basis points: 18% = 1800
  let gstP;
  let cgstP = null;
  let sgstP = null;
  if (gstType === 'CGST+SGST') {
    cgstP = mulDivRound(taxableP, rateBp, 20000);
    sgstP = cgstP;
    gstP = cgstP + sgstP;
  } else {
    gstP = mulDivRound(taxableP, rateBp, 10000);
  }
  const out = {
    subtotal: fromPaise(subtotalP),
    freight: fromPaise(freightPaise),
    gstType,
    gstRate,
    gstAmount: fromPaise(gstP),
    total: fromPaise(taxableP + gstP),
  };
  if (gstType === 'CGST+SGST') {
    out.cgst = fromPaise(cgstP);
    out.sgst = fromPaise(sgstP);
  }
  return out;
}

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 500000 -> "₹5,00,000.00" */
export const inr = (n) => inrFmt.format(Number(n) || 0);
