/* Bearingsetu business settings. This is the ONE file to edit for static hosting.
   Leave a value empty ("") and the website simply hides that line: nothing is made up.
   When apiBase is set, the same settings can be changed from the admin panel instead (see docs/API.md).

   Credit is NOT configured here. Credit is switched on per customer by an administrator on the backend,
   and only approved business accounts ever see it. */
window.BS_CONFIG = {
  // Address of the Bearingsetu API (server/). Leave empty to run the storefront on its own:
  // quotation requests then go out by email or WhatsApp, and there are no online accounts.
  apiBase: "",

  business: {
    name: "Bearingsetu",
    legalName: "",          // registered company name, shown on quotations
    gstin: "",              // 15 character GSTIN
    addressLines: [],       // e.g. ["Plot 12, MIDC", "Pune 411026"]
    city: "",
    state: "",
    stateCode: "",          // GST state code, e.g. "27". Decides IGST or CGST + SGST
    pin: "",
    phone: "",              // e.g. "+91 98765 43210"
    whatsapp: "",           // digits only with country code, e.g. "919876543210"
    email: "",              // where quotation requests are sent when there is no API
    supportEmail: "",
    hours: ""               // e.g. "Mon to Sat, 9:30 am to 6:30 pm"
  },

  pricing: {
    // "quote": prices are never shown, buyers request a quotation (safe default).
    // "list" : prices entered in commercial.js or the admin panel are shown (parts without a price still show "Quote").
    mode: "quote",
    gstRate: 18,
    showGstToggle: true
  },

  shipping: {
    // "quoted": freight is confirmed in each quotation. "flat": flatFee per order. "free-over": free above freeOver, else flatFee.
    mode: "quoted",
    flatFee: null,
    freeOver: null,
    note: "Freight is charged separately. It depends on weight, size and delivery location, and is confirmed in your quotation before you order.",
    leadTimeNote: ""        // e.g. "Dispatch times are confirmed per order." Leave empty to say nothing.
  },

  // A slim notice on the home page. Plain text and one optional link. Turn it off with enabled: false,
  // or set endsOn ("YYYY-MM-DD") to retire it automatically. Do not use it for delivery, discount or credit promises
  // unless they are real: credit in particular is only ever offered to approved accounts, never advertised.
  banner: {
    enabled: true,
    text: "Not sure of the part number? Send us the old part's number or its size.",
    linkText: "Request a quotation",
    linkUrl: "quick-order.html#rfq",
    endsOn: ""
  },

  catalogue: {
    // Load ratings, limiting speeds and weights are hidden until you have checked them against datasheets.
    showIndicativePerformance: false
  }
};
