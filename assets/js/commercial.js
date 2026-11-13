/* Bearingsetu commercial data: prices, stock and lead times. Ships EMPTY on purpose.

   Only real, verified numbers belong here. A product with no entry shows "Quote" and no stock claim.
   Prices are per unit in INR excluding GST. With the API enabled, the admin panel manages this data instead
   (Products and prices, with CSV import) and this file can stay empty.

   Format:
   window.BS_COMMERCIAL = {
     "skf-6205-2rs1": { price: 0, tiers: [[10, 0]], stock: 0, leadDays: 0, moq: 1 }
   };
   price: ex GST per unit.  tiers: [[minimum quantity, unit price], ...] (only if you really offer them).
   stock: units on hand (omit if you do not track it).  leadDays: working days to dispatch when asked.  moq: minimum order quantity. */
window.BS_COMMERCIAL = {};
