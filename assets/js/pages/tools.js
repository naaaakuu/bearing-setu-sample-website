/* Engineering tools: part number decoder, interchange, belt length, grease, inch/mm, suffix glossary.
   Pure logic lives in BS.tools (decode, equivalents, belt, grease, inch parsing) so it can be tested;
   the rest of the file renders it. */
(function () {
  "use strict";
  var BS = window.BS, $ = BS.$, $$ = BS.$$, esc = BS.esc, inr = BS.inr, icon = BS.icon;

  /* =================================================================== data */

  var GROUPS = ["Seals and shields", "Cage", "Clearance", "Precision", "Design", "Bore and rings"];

  /* Suffix and prefix dictionary. g = group index. seal = interchange class.
     pre = prefix (glossary only, never matched as a suffix). t = text by bearing type. */
  var SFX = [
    { c: "2RS1", g: 0, m: "Rubber contact seals on both sides, nitrile. Keeps grease in and dirt and water out.", b: "SKF", seal: "2RS" },
    { c: "2RSH", g: 0, m: "Rubber contact seals on both sides, SKF’s design for small and miniature sizes.", b: "SKF", seal: "2RS" },
    { c: "RS1", g: 0, m: "Rubber contact seal on one side only.", b: "SKF", seal: "RS" },
    { c: "RSH", g: 0, m: "Rubber contact seal on one side, small sizes.", b: "SKF", seal: "RS" },
    { c: "2RSL", g: 0, m: "Low-friction rubber seals on both sides. Runs cooler at speed, seals a little less than 2RS1.", b: "SKF", seal: "2RZ" },
    { c: "2RZ", g: 0, m: "Non-contact rubber seals on both sides. Low friction for high speeds.", b: "SKF", seal: "2RZ" },
    { c: "2RSR", g: 0, m: "Rubber contact seals on both sides.", b: "FAG", seal: "2RS" },
    { c: "RSR", g: 0, m: "Rubber contact seal on one side.", b: "FAG", seal: "RS" },
    { c: "DDU", g: 0, m: "Rubber contact seals on both sides.", b: "NSK", seal: "2RS" },
    { c: "DU", g: 0, m: "Rubber contact seal on one side.", b: "NSK", seal: "RS" },
    { c: "VV", g: 0, m: "Non-contact rubber seals on both sides, low friction.", b: "NSK", seal: "2RZ" },
    { c: "LLU", g: 0, m: "Rubber contact seals on both sides.", b: "NTN", seal: "2RS" },
    { c: "LU", g: 0, m: "Rubber contact seal on one side.", b: "NTN", seal: "RS" },
    { c: "LLB", g: 0, m: "Non-contact rubber seals on both sides, low friction.", b: "NTN", seal: "2RZ" },
    { c: "2RS", g: 0, m: "Rubber seals on both sides. The general code most makers use.", b: "Koyo, Timken, NBC, ZKL and others", seal: "2RS" },
    { c: "RS", g: 0, m: "Rubber seal on one side.", b: "Koyo, Timken, NBC, ZKL and others", seal: "RS" },
    { c: "2RU", g: 0, m: "Rubber contact seals on both sides.", b: "Koyo", seal: "2RS" },
    { c: "2Z", g: 0, m: "Metal shields on both sides. No contact, so less friction than seals; keeps out larger dirt but not water.", b: "SKF, ZKL", seal: "2Z" },
    { c: "2ZR", g: 0, m: "Metal shields on both sides.", b: "FAG", seal: "2Z" },
    { c: "ZZ", g: 0, m: "Metal shields on both sides.", b: "NSK, NTN, Koyo, NBC, Timken", seal: "2Z" },
    { c: "Z", g: 0, m: "Metal shield on one side.", b: "SKF, NSK, NTN, Koyo, NBC", seal: "Z" },
    { c: "ZR", g: 0, m: "Metal shield on one side.", b: "FAG", seal: "Z" },
    { c: "2CS", g: 0, m: "Contact seals of nitrile rubber reinforced with sheet steel, both sides. Found on sealed spherical roller bearings.", b: "SKF", seal: "2RS" },

    { c: "TN9", g: 1, m: "Glass-fibre reinforced polyamide 66 cage. Light and quiet; keep below about 120 °C.", b: "SKF" },
    { c: "TN", g: 1, m: "Polyamide cage.", b: "SKF" },
    { c: "TVP", g: 1, m: "Glass-fibre reinforced polyamide cage.", b: "FAG" },
    { c: "TVP2", g: 1, m: "Glass-fibre reinforced polyamide cage, second design.", b: "FAG" },
    { c: "TVH", g: 1, m: "Glass-fibre reinforced polyamide cage, on self-aligning ball bearings.", b: "FAG" },
    { c: "M", g: 1, m: "Machined brass cage. Strong under shock and vibration.", b: "SKF, FAG, NSK, NTN" },
    { c: "MA", g: 1, m: "Machined brass cage guided on the outer ring.", b: "SKF, FAG" },
    { c: "MB", g: 1, m: "Machined brass cage guided on the inner ring.", b: "SKF, FAG" },
    { c: "J", g: 1, m: "Pressed steel cage.", b: "SKF, NSK" },
    { c: "JN", g: 1, m: "Pressed steel cage. Same job as J; the letters differ by maker and series.", b: "Several makers" },
    { c: "J2", g: 1, m: "Pressed steel cage, second design. Standard on SKF tapered roller bearings.", b: "SKF" },
    { c: "JR", g: 1, m: "Pressed steel cage on tapered roller bearings.", b: "Koyo" },
    { c: "W", g: 1, m: "Pressed steel cage on angular contact ball bearings.", b: "NSK" },
    { c: "P", g: 1, m: "Glass-fibre reinforced polyamide cage, when it follows a design letter such as E or EC.", b: "SKF" },
    { c: "Y", g: 1, m: "Pressed brass cage.", b: "SKF" },

    { c: "C2", g: 2, m: "Internal clearance smaller than normal. For precise running at steady, low temperatures.", b: "All makers", clr: 1 },
    { c: "CN", g: 2, m: "Normal internal clearance. Usually not marked on the bearing.", b: "All makers", clr: 1 },
    { c: "C3", g: 2, m: "Internal clearance greater than normal. The usual choice for electric motors, tight fits or heat. SKF writes /C3, FAG -C3, Japanese makers C3.", b: "All makers", clr: 1 },
    { c: "C4", g: 2, m: "Clearance greater than C3. For hot-running machines such as vibrating screens and dryer rolls.", b: "All makers", clr: 1 },
    { c: "C5", g: 2, m: "Clearance greater than C4.", b: "All makers", clr: 1 },
    { c: "CM", g: 2, m: "Narrow clearance range for electric motor bearings.", b: "SKF, NSK", clr: 1 },

    { c: "P0", g: 3, m: "Normal tolerance class. Usually not marked.", b: "NSK, NTN, Koyo", prec: 1 },
    { c: "P6", g: 3, m: "Tolerance class 6, tighter than normal. For pumps, fans and quieter running.", b: "All makers", prec: 1 },
    { c: "P5", g: 3, m: "Tolerance class 5. For machine tool spindles and precision drives.", b: "All makers", prec: 1 },
    { c: "P4", g: 3, m: "Tolerance class 4. High precision spindles.", b: "All makers", prec: 1 },
    { c: "P63", g: 3, m: "Tolerance class P6 with C3 clearance, written as one code after the slash.", b: "SKF", pc: ["P6", "C3"] },
    { c: "P62", g: 3, m: "Tolerance class P6 with C2 clearance, written as one code.", b: "SKF", pc: ["P6", "C2"] },
    { c: "P53", g: 3, m: "Tolerance class P5 with C3 clearance, written as one code.", b: "SKF", pc: ["P5", "C3"] },
    { c: "P52", g: 3, m: "Tolerance class P5 with C2 clearance, written as one code.", b: "SKF", pc: ["P5", "C2"] },

    { c: "E", g: 4, m: "Reinforced internal design: larger or more rolling elements for a higher load rating.", b: "SKF, NSK, NTN, Timken" },
    { c: "E1", g: 4, m: "Reinforced internal design.", b: "FAG" },
    { c: "EC", g: 4, m: "Reinforced cylindrical roller design with optimised roller ends.", b: "SKF" },
    { c: "ECP", g: 4, m: "Reinforced EC design with a glass-fibre polyamide cage.", b: "SKF" },
    { c: "ECJ", g: 4, m: "Reinforced EC design with a pressed steel cage.", b: "SKF" },
    { c: "ECM", g: 4, m: "Reinforced EC design with a machined brass cage.", b: "SKF" },
    { c: "ET", g: 4, m: "Reinforced design with a polyamide cage.", b: "NSK" },
    { c: "EW", g: 4, m: "Reinforced design with a pressed steel cage.", b: "NSK" },
    { c: "EM", g: 4, m: "Reinforced design with a machined brass cage.", b: "NSK, NTN" },
    { c: "EK", g: 4, m: "Reinforced E design with a tapered bore (1:12).", b: "SKF", k: 1 },
    { c: "EA", g: 4, m: "Spherical roller design with pressed steel cages.", b: "NSK, NTN" },
    { c: "EAE4", g: 4, m: "Spherical roller EA design with a lubrication groove and holes in the outer ring.", b: "NSK" },
    { c: "E4", g: 4, m: "Lubrication groove and three holes in the outer ring.", b: "NSK" },
    { c: "W33", g: 4, m: "Lubrication groove and three holes in the outer ring, so grease reaches the rollers.", b: "SKF, NTN, Timken, ZKL, NBC" },
    { c: "C", g: 4, m: "Spherical roller C design: symmetrical rollers with a guide ring.", b: "SKF", t: { ac: "15° contact angle, for high-speed spindle bearings." } },
    { c: "CC", g: 4, m: "Spherical roller C design with two pressed steel window cages.", b: "SKF" },
    { c: "CA", g: 4, m: "Spherical roller C design with a machined brass cage.", b: "SKF" },
    { c: "CJ", g: 4, m: "Spherical roller C design with pressed steel cages.", b: "SKF" },
    { c: "B", g: 4, m: "40° contact angle on angular contact ball bearings, for higher axial load.", b: "All makers" },
    { c: "BE", g: 4, m: "40° contact angle, reinforced E design.", b: "SKF" },
    { c: "BEP", g: 4, m: "40° contact angle (B), reinforced design (E), glass-fibre polyamide cage (P).", b: "SKF" },
    { c: "BECBP", g: 4, m: "40° contact angle, E design, universally matchable for pairs (CB), polyamide cage (P).", b: "SKF" },
    { c: "CB", g: 4, m: "Universally matchable for paired mounting, normal axial clearance.", b: "SKF" },
    { c: "UA", g: 4, m: "Universal design for paired mounting, small axial clearance.", b: "FAG" },
    { c: "A", g: 4, m: "30° contact angle on angular contact ball bearings.", b: "SKF, NSK, NTN", t: { ac2: "30° contact angle, double row without filling slots." } },
    { c: "AC", g: 4, m: "25° contact angle on angular contact ball bearings.", b: "NSK, NTN, Koyo" },
    { c: "XL", g: 4, m: "X-life, Schaeffler’s higher-performance grade.", b: "FAG" },
    { c: "HC5", g: 4, m: "Hybrid bearing with silicon nitride ceramic balls. Insulates against stray electric current in inverter-fed motors.", b: "SKF" },
    { c: "Q", g: 4, m: "Optimised contact geometry and surface finish on tapered roller bearings.", b: "SKF" },
    { c: "DB", g: 4, m: "Matched pair mounted back to back.", b: "All makers" },
    { c: "DF", g: 4, m: "Matched pair mounted face to face.", b: "All makers" },
    { c: "DT", g: 4, m: "Matched pair mounted in tandem.", b: "All makers" },
    { c: "D1", g: 4, m: "NTN housed-unit suffix for the housing version. Check the NTN unit catalogue for the exact variant.", b: "NTN" },
    { c: "4T-", g: 4, m: "Prefix: NTN’s long-life tapered roller design, same boundary dimensions.", b: "NTN", pre: 1 },
    { c: "HR", g: 4, m: "Prefix: high-capacity tapered roller design.", b: "NSK", pre: 1 },

    { c: "K", g: 5, m: "Tapered bore, 1:12 taper. Mounts on an adapter or withdrawal sleeve.", b: "All makers", k: 1 },
    { c: "K30", g: 5, m: "Tapered bore, 1:30 taper. For large and wide bearings.", b: "All makers", k: 1 },
    { c: "N", g: 5, m: "Snap ring groove in the outer ring.", b: "All makers", snap: "N" },
    { c: "NR", g: 5, m: "Snap ring groove with the snap ring fitted.", b: "All makers", snap: "NR" },
    { c: "NU", g: 5, m: "Prefix: cylindrical roller bearing with ribs on the outer ring only, so the shaft can float axially.", b: "All makers", pre: 1 },
    { c: "NJ", g: 5, m: "Prefix: cylindrical roller, two outer ribs and one inner rib. Locates the shaft in one direction.", b: "All makers", pre: 1 },
    { c: "NUP", g: 5, m: "Prefix: cylindrical roller with a loose rib as well. Locates the shaft in both directions.", b: "All makers", pre: 1 },
    { c: "NF", g: 5, m: "Prefix: cylindrical roller with two inner ribs and one outer rib.", b: "All makers", pre: 1 },
    { c: "UC", g: 5, m: "Prefix: insert bearing with set-screw locking, used in pillow block and flange units.", b: "SKF, NTN, Koyo, NBC", pre: 1 },
    { c: "H", g: 5, m: "Prefix: adapter sleeve with locknut and washer, for example H 312 for a 22212 EK on a 55 mm shaft.", b: "SKF, FAG, NSK, NTN", pre: 1 }
  ];
  var SUF = SFX.filter(function (e) { return !e.pre; });

  /* ISO 15 boundary dimensions [D, B] by diameter series and bore code (d from the bore code). */
  function rows(s) { return s.split("|").map(function (r) { return r.split(",").map(Number); }); }
  var ISO = {
    "0": rows("26,8|28,8|32,9|35,10|42,12|47,12|55,13|62,14|68,15|75,16|80,16|90,18|95,18|100,18|110,20|115,20|125,22|130,22|140,24|145,24|150,24"),
    "2": rows("30,9|32,10|35,11|40,12|47,14|52,15|62,16|72,17|80,18|85,19|90,20|100,21|110,22|120,23|125,24|130,25|140,26|150,28|160,30|170,32|180,34"),
    "3": rows("35,11|37,12|42,13|47,14|52,15|62,17|72,19|80,21|90,23|100,25|110,27|120,29|130,31|140,33|150,35|160,37|170,39|180,41|190,43|200,45|215,47"),
    "8": rows("19,5|21,5|24,5|26,5|32,7|37,7|42,7|47,7|52,7|58,7|65,7"),
    "9": rows("22,6|24,6|28,7|30,7|37,9|42,9|47,9|55,10|62,12|68,12|72,12")
  };
  var ISO4 = { 3: [62, 17], 4: [72, 19], 5: [80, 21], 6: [90, 23], 7: [100, 25], 8: [110, 27], 9: [120, 29], 10: [130, 31] };
  var W22 = [0, 0, 0, 0, 18, 18, 20, 23, 23, 23, 23, 25, 28, 31, 31, 31, 33, 36, 40, 43, 46];
  var W23 = [0, 0, 0, 0, 21, 24, 27, 31, 33, 36, 40, 43, 46, 48, 51, 55, 58, 60, 64, 67, 73];
  var MINI = { "605": [5, 14, 5], "606": [6, 17, 6], "607": [7, 19, 6], "608": [8, 22, 7], "609": [9, 24, 7], "623": [3, 10, 4], "624": [4, 13, 5], "625": [5, 16, 5], "626": [6, 19, 6], "627": [7, 22, 7], "628": [8, 24, 8], "629": [9, 26, 8], "634": [4, 16, 5], "635": [5, 19, 6], "688": [8, 16, 5], "689": [9, 17, 5], "695": [5, 13, 4], "696": [6, 15, 5], "697": [7, 17, 5], "698": [8, 19, 6], "699": [9, 20, 6] };

  var MAKERS = [["skf", "SKF"], ["fag", "FAG"], ["nsk", "NSK"], ["ntn", "NTN"], ["koyo", "Koyo"], ["timken", "Timken"], ["nbc", "NBC"], ["zkl", "ZKL"]];

  var SEAL_TXT = { "2RS": "Rubber seals both sides", RS: "Rubber seal one side", "2Z": "Metal shields both sides", Z: "Metal shield one side", "2RZ": "Low-friction seals both sides", "": "Open, no seals or shields" };
  var SEALABLE = { dgbb: 1, ac2: 1, sab: 1 };

  /* ================================================================ decoder */

  function boreMm(code) { var n = parseInt(code, 10); return n === 0 ? 10 : n === 1 ? 12 : n === 2 ? 15 : n === 3 ? 17 : n * 5; }
  function boreTok(code, extra) {
    var n = parseInt(code, 10), mm = boreMm(code);
    return { code: code, kind: "bore", label: "Bore", text: n < 4 ? "Bore " + mm + " mm. Codes 00 to 03 are fixed: 10, 12, 15 and 17 mm." : "Bore " + mm + " mm, from " + code + " × 5." + (extra || "") };
  }
  var DIA = { "0": "Extra-light series, diameter series 0.", "1": "Extra-light series, diameter series 1.", "2": "Light series, diameter series 2. The most common.", "3": "Medium series, diameter series 3. Bigger balls for heavier loads.", "4": "Heavy series, diameter series 4.", "7": "Ultra-thin section, series 7.", "8": "Thin section, series 8. Small outer ring for tight spaces.", "9": "Thin section, series 9. Lighter than the 0 series." };
  function seriesTok(code, text) { return { code: code, kind: "series", label: "Series", text: text }; }
  function wdText(s) {
    var w = s.charAt(0), d = s.charAt(1);
    var dn = { "0": "extra light", "1": "extra light", "2": "light", "3": "medium", "4": "heavy", "8": "thin", "9": "thin" }[d] || "";
    return "Width series " + w + ", diameter series " + d + (dn ? " (" + dn + ")" : "") + ".";
  }

  var LA = "(?=$|[^0-9]|2(?:RS|Z|CS|RZ|RU))";
  function re(s) { return new RegExp("^" + s + LA); }
  var CRB_TXT = {
    NU: "Cylindrical roller bearing. Ribs on the outer ring only, so the shaft can float axially.",
    NJ: "Cylindrical roller bearing. Two outer ribs and one inner rib: locates the shaft in one direction.",
    NUP: "Cylindrical roller bearing. Like NJ with a loose rib: locates the shaft in both directions.",
    N: "Cylindrical roller bearing. Ribs on the inner ring only.",
    NF: "Cylindrical roller bearing. Two inner ribs and one outer rib.",
    NN: "Double-row cylindrical roller bearing, used in machine tool spindles."
  };
  var HOUSING = { P: "Pillow block housing, two bolts.", F: "Square flange housing, four bolts.", FL: "Oval flange housing, two bolts.", FC: "Round cartridge flange housing.", T: "Take-up housing, slides to tension a conveyor belt.", PA: "Tapped-base pillow block housing.", FB: "Three-bolt flange housing." };

  /* Each pattern returns the basic designation: type, tokens, a brand-neutral key and the series used for dimensions. */
  var PATTERNS = [
    [/^(UC|UK)(FL|FC|FB|PA|P|F|T)?(\d)(\d{2})(?:-(\d{1,2}))?/, function (m) {
      var t = [{ code: m[1], kind: "type", label: "Type", text: m[1] === "UC" ? "Insert bearing with set-screw locking, for housed units." : "Insert bearing with a tapered bore, mounted on an adapter sleeve." }];
      if (m[2]) t.push({ code: m[2], kind: "type", label: "Housing", text: HOUSING[m[2]] });
      t.push(seriesTok(m[3], m[3] === "2" ? "Light series insert, the common size." : m[3] === "3" ? "Medium series insert, heavier duty." : "Series " + m[3] + "."));
      var r = { type: "unit", name: (m[2] ? { P: "Pillow block unit", F: "Square flange unit", FL: "Oval flange unit", FC: "Cartridge flange unit", T: "Take-up unit", PA: "Pillow block unit", FB: "Flange unit" }[m[2]] : "Insert bearing"), basic: m[1] + (m[2] || "") + m[3] + m[4], key: m[1] + (m[2] || "") + m[3] + m[4], d: boreMm(m[4]) };
      if (m[5]) {
        t.push({ code: m[4], kind: "bore", label: "Size", text: "Housing size for bore code " + m[4] + "." });
        var inch = parseInt(m[5], 10) / 16;
        t.push({ code: "-" + m[5], kind: "bore", label: "Bore", text: "Inch bore: " + m[5] + " sixteenths = " + fracText(inch) + " in (" + fmt(inch * 25.4, 2) + " mm)." });
        r.d = Math.round(inch * 25.4 * 100) / 100; r.basic += "-" + m[5]; r.key += "-" + m[5];
      } else t.push(boreTok(m[4]));
      r.tokens = t; return r;
    }],
    [/^NA(\d{2})(\d{2})/, function (m) { return { type: "needle", name: "Needle roller bearing", basic: "NA" + m[1] + m[2], key: "NA" + m[1] + m[2], d: boreMm(m[2]), tokens: [{ code: "NA", kind: "type", label: "Type", text: "Needle roller bearing with an inner ring." }, seriesTok(m[1], "Series " + m[1] + ", the common light section."), boreTok(m[2])] }; }],
    [/^RNA(\d{2})(\d{2})/, function (m) { return { type: "needle", name: "Needle roller bearing", basic: "RNA" + m[1] + m[2], key: "RNA" + m[1] + m[2], tokens: [{ code: "RNA", kind: "type", label: "Type", text: "Needle roller bearing without an inner ring; the rollers run on the shaft." }, seriesTok(m[1], "Series " + m[1] + "."), { code: m[2], kind: "bore", label: "Size", text: "Size code " + m[2] + ". Same housing as NA" + m[1] + m[2] + "." }] }; }],
    [/^NK(\d{1,3})\/(\d{1,3})/, function (m) { return { type: "needle", name: "Needle roller bearing", basic: "NK" + m[1] + "/" + m[2], key: "NK" + m[1] + "/" + m[2], d: +m[1], B: +m[2], tokens: [{ code: "NK", kind: "type", label: "Type", text: "Needle roller bearing with a machined outer ring and no inner ring." }, { code: m[1], kind: "bore", label: "Shaft", text: "Runs on a " + m[1] + " mm hardened shaft." }, { code: "/" + m[2], kind: "bore", label: "Width", text: "Width " + m[2] + " mm." }] }; }],
    [/^(HK|BK)(\d{2})(\d{2})/, function (m) { return { type: "needle", name: "Drawn cup needle roller bearing", basic: m[1] + m[2] + m[3], key: m[1] + m[2] + m[3], d: +m[2], B: +m[3], tokens: [{ code: m[1], kind: "type", label: "Type", text: m[1] === "HK" ? "Drawn cup needle roller bearing, open at both ends." : "Drawn cup needle roller bearing, closed at one end." }, { code: m[2], kind: "bore", label: "Shaft", text: "Shaft diameter " + (+m[2]) + " mm." }, { code: m[3], kind: "bore", label: "Width", text: "Width " + (+m[3]) + " mm." }] }; }],
    [re("(NUP|NU|NJ|NF|NN|N)(\\d{3,4})"), function (m) {
      var dg = m[2], s = dg.length === 3 ? dg.charAt(0) : dg.slice(0, 2), b = dg.length === 3 ? dg.slice(1) : dg.slice(2);
      return { type: "crb", name: "Cylindrical roller bearing", letters: m[1], basic: m[1] + s + b, key: m[1] + s + b, series: s, code: b, d: boreMm(b), tokens: [{ code: m[1], kind: "type", label: "Type", text: CRB_TXT[m[1]] }, seriesTok(s, s.length === 1 ? DIA[s] || "Series " + s + "." : wdText(s)), boreTok(b)] };
    }],
    [/^(LM|HM|JLM|JL|LL|JM|JH|L|M|H)(\d{5,6})(?:\/(?:LM|HM|JLM|JL|LL|JM|JH|L|M|H)?(\d{5,6}))?/, function (m) {
      var t = [{ code: m[1], kind: "type", label: "Type", text: "Inch-series tapered roller bearing. " + (/^J/.test(m[1]) ? "J marks a metric-size part in the inch system." : "Letters give the load class: L light, M medium, H heavy.") }, { code: m[2], kind: "bore", label: "Cone", text: "Cone (inner ring with rollers) number. Sizes are in a lookup table, not in the number." }];
      if (m[3]) t.push({ code: "/" + m[3], kind: "bore", label: "Cup", text: "Cup (outer ring) number. Cone and cup are sold separately or as a set." });
      return { type: "inch", name: "Inch tapered roller bearing", basic: m[0].replace(/\/(\d)/, "/" + m[1] + "$1"), key: m[0], tokens: t, partial: "Inch tapered bearings carry their sizes in the maker’s tables, so we can name the parts but not the dimensions." };
    }],
    [re("5([1-4]\\d)(\\d{2})"), function (m) { return { type: "tbb", name: "Thrust ball bearing", basic: "5" + m[1] + m[2], key: "5" + m[1] + m[2], d: boreMm(m[2]), tokens: [{ code: "5", kind: "type", label: "Type", text: "Thrust ball bearing, single direction. Takes axial load only." }, seriesTok(m[1], "Height series " + m[1].charAt(0) + ", diameter series " + m[1].charAt(1) + "."), boreTok(m[2], " Shaft washer bore.")] }; }],
    [re("5([23])(\\d{2})"), function (m) { return { type: "ac2", name: "Double-row angular contact ball bearing", basic: "5" + m[1] + m[2], key: "3" + m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: "5", kind: "type", label: "Type", text: "Double-row angular contact ball bearing. NTN and Koyo number these 52 and 53; SKF and FAG use 32 and 33." }, seriesTok(m[1], DIA[m[1]]), boreTok(m[2])] }; }],
    [re("3([0-3]\\d)(\\d{2})"), function (m) {
      if (!/^(02|03|13|20|22|23|29|30|31|32)$/.test(m[1])) return null;
      return { type: "trb", name: "Tapered roller bearing", basic: "3" + m[1] + m[2], key: "3" + m[1] + m[2], d: boreMm(m[2]), tokens: [{ code: "3", kind: "type", label: "Type", text: "Tapered roller bearing. Takes heavy radial and axial load in one direction." }, seriesTok(m[1], wdText(m[1]) + (m[1] === "02" ? " The 302 series is the most common." : "")), boreTok(m[2])] };
    }],
    [re("3([23])(\\d{2})"), function (m) { return { type: "ac2", name: "Double-row angular contact ball bearing", basic: "3" + m[1] + m[2], key: "3" + m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: "3", kind: "type", label: "Type", text: "Double-row angular contact ball bearing. Takes axial load in both directions." }, seriesTok(m[1], DIA[m[1]]), boreTok(m[2])] }; }],
    [re("2([1-4]\\d)(\\d{2})"), function (m) {
      if (!/^(13|22|23|30|31|32|39|40|41|48|49)$/.test(m[1])) return null;
      return { type: "srb", name: "Spherical roller bearing", basic: "2" + m[1] + m[2], key: "2" + m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: "2", kind: "type", label: "Type", text: "Spherical roller bearing. Two rows of barrel rollers that self-align, for heavy loads and shaft deflection." }, seriesTok(m[1], wdText(m[1])), boreTok(m[2])] };
    }],
    [re("(2[23])(\\d{2})"), function (m) { return { type: "sab", name: "Self-aligning ball bearing", basic: m[1] + m[2], key: m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: m[1], kind: "type", label: "Type and series", text: "Self-aligning ball bearing, wide " + m[1] + " series. Two rows of balls in a spherical outer race." }, boreTok(m[2])] }; }],
    [re("16(0)(\\d{2})"), function (m) { return { type: "dgbb", name: "Deep groove ball bearing", basic: "160" + m[2], key: "160" + m[2], series: "160", code: m[2], d: boreMm(m[2]), tokens: [{ code: "160", kind: "type", label: "Type and series", text: "Deep groove ball bearing, extra-thin 160 series: narrower than a 60." }, boreTok(m[2])] }; }],
    [re("1([0-3])(\\d{2})"), function (m) { return { type: "sab", name: "Self-aligning ball bearing", basic: "1" + m[1] + m[2], key: "1" + m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: "1", kind: "type", label: "Type", text: "Self-aligning ball bearing. Two rows of balls; tolerates shaft misalignment." }, seriesTok(m[1], DIA[m[1]]), boreTok(m[2])] }; }],
    [re("7(1[89]|[0-3])(\\d{2})"), function (m) { return { type: "ac", name: "Angular contact ball bearing", basic: "7" + m[1] + m[2], key: "7" + m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: "7", kind: "type", label: "Type", text: "Angular contact ball bearing, single row. Takes combined radial and axial load in one direction." }, seriesTok(m[1], m[1].length === 1 ? DIA[m[1]] : "Thin spindle series " + m[1] + "."), boreTok(m[2])] }; }],
    [re("6(1[789])(\\d{2})"), function (m) { var n = m[1].charAt(1); return { type: "dgbb", name: "Deep groove ball bearing", basic: "6" + m[1] + m[2], key: "6" + n + m[2], series: n, code: m[2], d: boreMm(m[2]), tokens: [{ code: "6", kind: "type", label: "Type", text: "Deep groove ball bearing. The everyday bearing in motors, pumps and gearboxes." }, seriesTok(m[1], "Width series 1, diameter series " + n + ". Others write the same bearing as 6" + n + m[2] + "."), boreTok(m[2])] }; }],
    [/^6(1[89]|\d)\/(\d{1,3}(?:\.\d+)?)/, function (m) { var n = m[1].length === 2 ? m[1].charAt(1) : m[1]; return { type: "dgbb", name: "Deep groove ball bearing", basic: "6" + m[1] + "/" + m[2], key: "6" + n + "/" + m[2], d: +m[2], tokens: [{ code: "6", kind: "type", label: "Type", text: "Deep groove ball bearing." }, seriesTok(m[1], DIA[n] || "Series " + m[1] + "."), { code: "/" + m[2], kind: "bore", label: "Bore", text: "Bore " + m[2] + " mm. A slash means the bore is written in millimetres." }] }; }],
    [re("6([0-4]|[7-9])(\\d{2})"), function (m) { return { type: "dgbb", name: "Deep groove ball bearing", basic: "6" + m[1] + m[2], key: "6" + m[1] + m[2], series: m[1], code: m[2], d: boreMm(m[2]), tokens: [{ code: "6", kind: "type", label: "Type", text: "Deep groove ball bearing. The everyday bearing in motors, pumps and gearboxes." }, seriesTok(m[1], DIA[m[1]]), boreTok(m[2])] }; }],
    [re("6(\\d)(\\d)"), function (m) { return { type: "dgbb", mini: true, name: "Miniature deep groove ball bearing", basic: "6" + m[1] + m[2], key: "6" + m[1] + m[2], series: m[1], d: +m[2], tokens: [{ code: "6", kind: "type", label: "Type", text: "Deep groove ball bearing, miniature size." }, seriesTok(m[1], DIA[m[1]] || "Series " + m[1] + "."), { code: m[2], kind: "bore", label: "Bore", text: "Bore " + m[2] + " mm. On three-digit miniatures the last digit is the bore." }] }; }]
  ];

  /* Split the suffix into known codes, preferring the reading with fewest unknown letters, then fewest tokens. */
  function splitSuffix(str) {
    var parts = str.split(/[-\/.\s]+/).filter(Boolean), out = [];
    parts.forEach(function (s) {
      var n = s.length, best = [{ cost: 0, list: [] }];
      for (var i = 0; i < n; i++) {
        if (!best[i]) continue;
        relax(i + 1, best[i].cost + 10, best[i].list.concat([{ unk: s.charAt(i) }]));
        for (var k = 0; k < SUF.length; k++) {
          var c = SUF[k].c;
          if (s.substr(i, c.length) === c) relax(i + c.length, best[i].cost + 1, best[i].list.concat([{ e: SUF[k] }]));
        }
      }
      function relax(j, cost, list) { if (!best[j] || cost < best[j].cost) best[j] = { cost: cost, list: list }; }
      var unkN = best[n].list.filter(function (it) { return it.unk; }).length;
      // Mostly unreadable: report the whole chunk rather than guessing at single letters inside it.
      if (n >= 3 && unkN * 3 >= n) { out.push({ unk: s, part: s }); return; }
      best[n].list.forEach(function (it) {
        var last = out[out.length - 1];
        if (it.unk && last && last.unk && last.part === s) last.unk += it.unk;
        else out.push(it.unk ? { unk: it.unk, part: s } : it);
      });
    });
    return out;
  }

  function groupLabel(e) {
    if (e.g === 0) return e.seal === "2Z" || e.seal === "Z" ? "Shields" : "Seals";
    if (e.g === 5) return e.snap ? "Outer ring" : "Bore";
    if (e.pc) return "Precision and clearance";
    return ["", "Cage", "Clearance", "Precision", "Design"][e.g];
  }

  var BRAND_RE = /^(SKF|FAG|INA|NSK|NTN|KOYO|TIMKEN|NBC|ZKL|SCHAEFFLER)(?:[\s-]+)/;
  var STYLE = { SKF: "SKF", FAG: "FAG", NSK: "NSK", NTN: "NTN", Koyo: "Koyo" };
  function decode(input) {
    var raw = String(input == null ? "" : input).trim().slice(0, 40);
    var r = { raw: raw, tokens: [], unknown: [], seal: "", clr: "", prec: "", taper: false, snap: "", extras: [], ok: false };
    if (!raw) { r.empty = true; return r; }
    var s = raw.toUpperCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
    var bm = s.match(BRAND_RE);
    if (bm) {
      r.brand = bm[1];
      r.tokens.push({ code: bm[1] === "KOYO" ? "Koyo" : bm[1] === "TIMKEN" ? "Timken" : bm[1], kind: "brand", label: "Maker", text: "The rest of the number follows this maker’s conventions." });
      s = s.slice(bm[0].length);
    }
    var c = s.replace(/\s+/g, "");
    var pm = c.match(/^(4T-?|HR)(?=\d)/);
    if (pm) {
      r.tokens.push({ code: pm[1].replace(/-?$/, pm[1] === "HR" ? "" : "-"), kind: "prefix", label: "Prefix", text: pm[1] === "HR" ? "NSK high-capacity tapered roller design. Same boundary dimensions." : "NTN 4T: long-life tapered roller design. Same boundary dimensions." });
      c = c.slice(pm[0].length);
    }
    var base = null, used = 0;
    for (var i = 0; i < PATTERNS.length && !base; i++) {
      var m = c.match(PATTERNS[i][0]);
      if (m) { base = PATTERNS[i][1](m); used = m[0].length; }
    }
    if (!base) {
      r.unknown.push(c || s);
      r.tokens.push({ code: c || s, kind: "unknown", label: "Not recognised", text: "We could not find a bearing type here. Check the number, or try the catalogue search." });
      return r;
    }
    r.ok = true;
    r.type = base.type; r.name = base.name; r.basic = base.basic; r.key = base.key; r.mini = !!base.mini; r.letters = base.letters;
    r.partial = base.partial || "";
    r.tokens = r.tokens.concat(base.tokens);
    var rest = c.slice(used);
    splitSuffix(rest).forEach(function (it) {
      if (it.unk) {
        r.unknown.push(it.unk);
        r.tokens.push({ code: it.unk, kind: "unknown", label: "Not recognised", text: "Not in our list. It may be a maker-specific code; ask us and we will check." });
        return;
      }
      var e = it.e;
      var text = (e.t && e.t[r.type]) || e.m;
      r.tokens.push({ code: e.c, kind: "suffix", label: groupLabel(e), text: text, group: e.g });
      if (e.seal) r.seal = e.seal;
      else if (e.pc) { r.prec = e.pc[0]; r.clr = e.pc[1]; }
      else if (e.clr) r.clr = e.c === "CN" ? "" : e.c;
      else if (e.prec) r.prec = e.c === "P0" ? "" : e.c;
      else if (e.snap) r.snap = e.snap;
      else r.extras.push(e.c);
      if (e.k) r.taper = true;
      if (!r.style && STYLE[e.b]) r.style = STYLE[e.b];
    });
    if (!r.style && pm) r.style = pm[1] === "HR" ? "NSK" : "NTN";
    if (r.type === "ac") r.angle = r.extras.indexOf("B") > -1 || r.extras.indexOf("BE") > -1 || r.extras.indexOf("BEP") > -1 || r.extras.indexOf("BECBP") > -1 ? "B" : r.extras.indexOf("AC") > -1 ? "AC" : r.extras.indexOf("A") > -1 ? "A" : r.extras.indexOf("C") > -1 ? "C" : "";
    var dm = dims(r, base);
    if (dm) { r.d = dm.d; r.D = dm.D; r.B = dm.B; r.dimSrc = dm.src; }
    else if (base.d != null) { r.d = base.d; if (base.B != null) r.B = base.B; }
    return r;
  }

  function dims(r, base) {
    var s = base.series, code = base.code != null ? parseInt(base.code, 10) : null;
    if (r.type === "dgbb" && r.mini && MINI[r.key]) return { d: MINI[r.key][0], D: MINI[r.key][1], B: MINI[r.key][2], src: "iso" };
    if (code != null && code <= 20) {
      var fam = null;
      if (r.type === "dgbb" || r.type === "ac" || r.type === "sab" || r.type === "crb" || r.type === "ac2") {
        if (s === "10") s = "0";
        if (s === "22" || s === "23") {
          var w = s === "22" ? W22[code] : W23[code];
          var t = ISO[s.charAt(1)][code];
          if (w && t && r.type !== "ac2") return { d: boreMm(base.code), D: t[0], B: w, src: "iso" };
        } else if (s === "4" && ISO4[code]) return { d: boreMm(base.code), D: ISO4[code][0], B: ISO4[code][1], src: "iso" };
        else if (ISO[s] && r.type !== "ac2") fam = ISO[s][code];
        if (fam) return { d: boreMm(base.code), D: fam[0], B: fam[1], src: "iso" };
      }
      if (r.type === "srb" && (s === "22" || s === "23") && (s === "22" ? W22[code] : W23[code])) {
        var t2 = ISO[s.charAt(1)][code];
        return { d: boreMm(base.code), D: t2[0], B: s === "22" ? W22[code] : W23[code], src: "iso" };
      }
    }
    var p = catalogueByKey(r);
    if (p && p.D != null) return { d: p.d, D: p.D, B: p.B, src: "catalogue" };
    return null;
  }

  /* Decode every catalogue bearing once, to match equivalents and borrow dimensions. */
  var CAT_DEC = null;
  function catDecoded() {
    if (CAT_DEC) return CAT_DEC;
    CAT_DEC = [];
    BS.products.forEach(function (p) {
      if (["ball-bearings", "roller-bearings", "housed-units"].indexOf(p.cat) === -1) return;
      var d;
      try { d = decodeLite(p.pn); } catch (e) { d = null; }
      if (d && d.ok) CAT_DEC.push({ p: p, d: d });
    });
    return CAT_DEC;
  }
  // Same as decode but without the dimension lookup (avoids recursion while indexing).
  function decodeLite(pn) {
    var saved = dims;
    dims = function () { return null; };
    try { return decode(pn); } finally { dims = saved; }
  }
  function catalogueByKey(r) {
    var list = catDecoded();
    for (var i = 0; i < list.length; i++) if (list[i].d.type === r.type && list[i].d.key === r.key && list[i].p.D != null) return list[i].p;
    return null;
  }
  function sameKey(a, b) { return a.type === b.type && a.key === b.key && !!a.taper === !!b.taper; }
  function sameVersion(a, b) { return sameKey(a, b) && a.seal === b.seal && a.clr === b.clr && a.prec === b.prec && a.snap === b.snap; }

  /* ============================================================ interchange */

  var SEALS = {
    skf: { "2RS": "-2RS1", RS: "-RS1", "2Z": "-2Z", Z: "-Z", "2RZ": "-2RZ" },
    fag: { "2RS": "-2RSR", RS: "-RSR", "2Z": "-2ZR", Z: "-ZR" },
    nsk: { "2RS": "DDU", RS: "DU", "2Z": "ZZ", Z: "Z", "2RZ": "VV" },
    ntn: { "2RS": "LLU", RS: "LU", "2Z": "ZZ", Z: "Z", "2RZ": "LLB" },
    koyo: { "2RS": "-2RS", RS: "-RS", "2Z": "ZZ", Z: "Z" },
    timken: { "2RS": "-2RS", RS: "-RS", "2Z": "-ZZ", Z: "-Z" },
    nbc: { "2RS": "-2RS", RS: "-RS", "2Z": "ZZ", Z: "Z" },
    zkl: { "2RS": "-2RS", RS: "-RS", "2Z": "-2Z", Z: "-Z" }
  };
  var CLR_SEP = { skf: "/", fag: "-", nsk: "", ntn: "", koyo: "", timken: "-", nbc: "", zkl: "" };

  function tail(brand, r) {
    var out = "";
    var snap = r.snap ? (brand === "skf" ? (r.seal ? "" : " ") + r.snap : brand === "fag" ? "-" + r.snap : r.snap) : "";
    out += snap;
    if (brand === "skf" && (r.clr || r.prec)) out += "/" + (r.prec && r.clr ? r.prec + r.clr.slice(1) : r.prec || r.clr);
    else {
      if (r.clr) out += CLR_SEP[brand] + r.clr;
      if (r.prec) out += (brand === "fag" ? "-" : "") + r.prec;
    }
    return out;
  }
  function sealOf(brand, r) {
    if (!r.seal) return "";
    var v = SEALS[brand][r.seal];
    if (v == null) return null;
    if (brand === "skf" && r.mini && r.seal === "2RS") v = "-2RSH";
    if (brand === "skf" && r.mini && r.seal === "RS") v = "-RSH";
    if (brand === "fag" && r.mini && r.seal === "2Z") v = "-2Z";
    if (brand === "fag" && r.mini && r.seal === "Z") v = "-Z";
    return v;
  }

  function designation(brand, r) {
    var k = r.key, t = r.type, seal, cs = CLR_SEP[brand];
    function clrJ() { return (r.clr ? (brand === "skf" ? "/" : brand === "fag" ? "-" : "") + r.clr : ""); }
    switch (t) {
      case "dgbb":
        seal = sealOf(brand, r);
        if (seal == null) return null;
        var b = k;
        var sm = k.match(/^6([89])(\d{2})$/), mm = k.match(/^6([89])(\d)$/);
        if ((brand === "skf" || brand === "fag" || brand === "zkl") && sm) b = "61" + sm[1] + sm[2];
        if ((brand === "skf" || brand === "fag") && mm) b = "61" + mm[1] + "/" + mm[2];
        return b + seal + tail(brand, r);
      case "ac":
        var ang = r.angle;
        if (ang === "B") return k + ({ skf: " BEP", fag: "-B-XL-TVP", nsk: "BW" }[brand] || "B") + clrJ();
        return k + (ang ? (brand === "skf" ? " " : brand === "fag" ? "-" : "") + ang : "") + clrJ();
      case "ac2":
        seal = r.seal ? { skf: { "2RS": "-2RS1", "2Z": "-2Z" }, fag: { "2RS": "-2RSR", "2Z": "-2ZR" }, ntn: { "2RS": "LLU", "2Z": "ZZ" } }[brand] : null;
        var sv = r.seal ? (seal ? seal[r.seal] : r.seal === "2RS" ? "-2RS" : r.seal === "2Z" ? "ZZ" : null) : "";
        if (sv == null) return null;
        var n52 = "5" + k.slice(1);
        if (brand === "skf") return k + " A" + sv + clrJ();
        if (brand === "fag") return k + "-B" + sv + "-TVH" + clrJ();
        if (brand === "zkl") return k + "A" + sv + clrJ();
        if (brand === "timken") return null;
        return n52 + sv + clrJ();
      case "sab":
        var K = r.taper;
        var ss = r.seal === "2RS";
        if (r.seal && !ss) return null;
        if (brand === "skf") return k + " E" + (K ? "K" : "") + (ss ? "-2RS1" : "") + "TN9" + clrJ();
        if (brand === "fag") return k + (K ? "-K" : "") + (ss ? "-2RS" : "") + "-TVH" + clrJ();
        if (brand === "ntn") return k + (K ? "SK" : "") + (ss ? "LLU" : "") + clrJ();
        return k + (K ? "K" : "") + (ss ? "-2RS" : "") + clrJ();
      case "trb":
        var common = /^3(02|03|20|22|23)/.test(k);
        return ({ skf: k + (common ? " J2/Q" : ""), fag: k + (common ? "-XL" : ""), nsk: "HR" + k + "J", ntn: "4T-" + k, koyo: k + "JR", timken: k, nbc: k, zkl: k + "A" })[brand];
      case "srb":
        var KK = r.taper;
        return ({
          skf: k + " E" + (KK ? "K" : "") + (r.clr ? "/" + r.clr : ""),
          fag: k + "-E1-XL" + (KK ? "-K" : "") + (r.clr ? "-" + r.clr : ""),
          nsk: k + (KK ? "EAKE4" : "EAE4") + r.clr,
          ntn: k + (KK ? "EAKW33" : "EAW33") + r.clr,
          koyo: k + "RHR" + (KK ? "K" : "") + "W33" + r.clr,
          timken: k + (KK ? "KEJW33" : "EJW33") + r.clr,
          nbc: k + (KK ? "EKW33" : "EW33") + r.clr,
          zkl: k + (KK ? "EW33KJ" : "EW33J") + r.clr
        })[brand];
      case "crb":
        var L = r.letters, num = k.slice(L.length);
        return ({ skf: L + " " + num + " ECP", fag: k + "-E-XL-TVP2", nsk: k + "ET", ntn: k + "E", koyo: k, timken: k + "EMA", nbc: k + "E", zkl: k + "E" })[brand] + clrJ();
      case "tbb":
        return k;
      case "needle":
        if (brand === "zkl" || (brand === "nsk" && /^(HK|BK)/.test(k))) return null;
        if (brand === "skf") return k.replace(/^(NA|RNA|NK|HK|BK)/, "$1 ");
        return k;
      case "unit":
        if (brand === "fag" || brand === "timken" || brand === "zkl") return null;
        if (brand === "skf") return k.replace(/^(UC|UK)(FL|FC|FB|PA|P|F|T)?/, function (a) { return a + " "; });
        if (brand === "ntn") return k + (/^UC(P|F|FL|T)\d{3}$/.test(k) ? "D1" : "");
        return k;
      case "inch":
        return r.basic;
    }
    return null;
  }

  function equivalents(r) {
    var cat = catDecoded();
    return MAKERS.map(function (mk) {
      var code = r.ok ? designation(mk[0], r) : null;
      var stocked = cat.filter(function (x) { return x.p.brand === mk[0] && sameVersion(x.d, r); }).map(function (x) { return x.p; });
      if (!stocked.length && code) stocked = BS.products.filter(function (p) { return p.brand === mk[0] && BS.norm(p.pn) === BS.norm(code); });
      stocked.sort(function (a, b) { return (b.stock > 0) - (a.stock > 0) || a.price - b.price; });
      var entered = r.brand ? r.brand.toLowerCase() === mk[0] || (r.brand === "INA" && mk[0] === "fag") : r.style === mk[1];
      return { id: mk[0], name: mk[1], code: code, p: stocked[0] || null, entered: !!entered };
    });
  }
  function variants(r) {
    return catDecoded().filter(function (x) { return sameKey(x.d, r) && !sameVersion(x.d, r); }).map(function (x) { return { p: x.p, d: x.d }; });
  }

  /* ==================================================================== belt */

  var R40 = [100, 106, 112, 118, 125, 132, 140, 150, 160, 170, 180, 190, 200, 212, 224, 236, 250, 265, 280, 300, 315, 335, 355, 375, 400, 425, 450, 475, 500, 530, 560, 600, 630, 670, 710, 750, 800, 850, 900, 950];
  var BELT = {
    Z: { kind: "classical", off: 22, min: 50, lo: 20, hi: 80, w: 10 },
    A: { kind: "classical", off: 33, min: 75, lo: 20, hi: 180, w: 13 },
    B: { kind: "classical", off: 43, min: 125, lo: 26, hi: 300, w: 17 },
    C: { kind: "classical", off: 56, min: 200, lo: 51, hi: 390, w: 22 },
    SPZ: { kind: "wedge", min: 63, lo: 630, hi: 3550, w: 10 },
    SPA: { kind: "wedge", min: 90, lo: 800, hi: 4500, w: 13 },
    SPB: { kind: "wedge", min: 140, lo: 1250, hi: 8000, w: 16 },
    SPC: { kind: "wedge", min: 224, lo: 2000, hi: 12500, w: 22 }
  };
  function wedgeLengths(sec) {
    var b = BELT[sec], out = [];
    [10, 100].forEach(function (f) { R40.forEach(function (v) { var L = v * f; if (L >= b.lo && L <= b.hi) out.push(L); }); });
    return out;
  }
  function beltCalc(sec, d1, d2, C, rpm) {
    var b = BELT[sec];
    var L = 2 * C + Math.PI * (d1 + d2) / 2 + Math.pow(d2 - d1, 2) / (4 * C);
    var small = Math.min(d1, d2);
    var wrap = 180 - 2 * Math.asin(Math.min(1, Math.abs(d2 - d1) / (2 * C))) * 180 / Math.PI;
    var out = { sec: sec, kind: b.kind, L: L, ratio: d2 / d1, wrap: wrap, small: small, min: b.min };
    if (rpm) { out.v = Math.PI * d1 * rpm / 60000; out.n2 = rpm * d1 / d2; }
    var std;
    if (b.kind === "classical") {
      var Li = L - b.off, inch = Math.round(Li / 25.4);
      var clamped = Math.max(b.lo, Math.min(b.hi, inch));
      std = { code: sec + "-" + clamped, alt: sec + clamped, inch: clamped, Li: clamped * 25.4, Lp: clamped * 25.4 + b.off, out: clamped !== inch };
    } else {
      var list = wedgeLengths(sec), best = list[0];
      list.forEach(function (x) { if (Math.abs(x - L) < Math.abs(best - L)) best = x; });
      std = { code: sec + " " + best, alt: sec + best, Lp: best, out: L < b.lo - 60 || L > b.hi + 200 };
    }
    var bb = std.Lp - Math.PI * (d1 + d2) / 2, disc = bb * bb - 2 * Math.pow(d2 - d1, 2);
    std.C = disc >= 0 ? (bb + Math.sqrt(disc)) / 4 : null;
    out.std = std;
    return out;
  }

  /* ============================================================ inch and mm */

  var VULGAR = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅓": "1/3", "⅔": "2/3" };
  function parseInch(str) {
    var s = String(str || "").trim().replace(/[½¼¾⅛⅜⅝⅞⅓⅔]/g, function (c) { return " " + VULGAR[c]; }).replace(/\s*(inches|inch|in|″|")\.?$/i, "").replace(/,/g, ".").trim();
    if (!s) return null;
    var m;
    if ((m = s.match(/^(\d*\.?\d+)$/))) return parseFloat(m[1]);
    if ((m = s.match(/^(\d+)\s*(?:-|\s)\s*(\d+)\s*\/\s*(\d+)$/))) return +m[3] ? +m[1] + m[2] / m[3] : NaN;
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return +m[2] ? m[1] / m[2] : NaN;
    return NaN;
  }
  function fracText(x) {
    var n = Math.round(x * 64), whole = Math.floor(n / 64), rem = n % 64, den = 64;
    while (rem && rem % 2 === 0) { rem /= 2; den /= 2; }
    if (!rem) return String(whole);
    return (whole ? whole + "-" : "") + rem + "/" + den;
  }
  function fmt(n, dp) { var v = Number(n.toFixed(dp)); return v.toLocaleString("en-IN", { maximumFractionDigits: dp }); }
  function num(v) { var s = String(v == null ? "" : v).trim().replace(/,/g, ""); if (!s) return null; return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN; }

  BS.tools = { decode: decode, equivalents: equivalents, designation: designation, variants: variants, beltCalc: beltCalc, wedgeLengths: wedgeLengths, parseInch: parseInch, fracText: fracText, SFX: SFX };

  /* =============================================================== rendering */

  function catRow(p, opts) {
    opts = opts || {};
    var b = BS.brand(p.brand), st = BS.stock(p);
    return '<div class="prow" data-pid="' + esc(p.id) + '">' +
      '<a class="prow__img" href="' + BS.url(p) + '" tabindex="-1" aria-hidden="true">' + BS.imgTag(p.img, { alt: "", sizes: "72px", cls: "" }).replace("<img ", "<img data-fly ") + "</a>" +
      '<div class="prow__body"><a class="prow__t" href="' + BS.url(p) + '">' + esc(b.name + " " + p.pn) + "</a>" +
      '<p class="prow__s">' + (opts.note ? '<span class="prow__note">' + opts.note + "</span> · " : "") + (opts.sub != null ? opts.sub : BS.subtitle(p)) + "</p>" +
      '<p class="' + st.cls + '">' + esc(st.text) + "</p></div>" +
      '<div class="prow__buy"><p class="prow__p">' + BS.priceHTML(p.price, p) + "</p>" +
      '<button class="btn btn--sm btn--add" type="button" data-add="' + esc(p.id) + '" aria-label="Add ' + esc(b.name + " " + p.pn) + ' to bag">Add to bag</button></div></div>';
  }
  function sealLabel(d) {
    var bits = [];
    if (SEALABLE[d.type] || d.seal) bits.push(SEAL_TXT[d.seal || ""]);
    bits.push(d.clr ? d.clr + " clearance" : "Normal clearance");
    if (d.prec) bits.push(d.prec + " precision");
    if (d.taper) bits.push("Tapered bore");
    return bits.join(" · ");
  }
  function chips(list, attr) {
    return list.map(function (x) { return '<button class="chip chip--outline" type="button" ' + attr + '="' + esc(x) + '">' + esc(x) + "</button>"; }).join("");
  }
  /* Write HTML only when it changed, so a repeat render (on blur, on a debounce) never swaps a
     button out from under a click that is already in progress. */
  function setHTML(el, html) { if (el._html === html) return false; el._html = html; el.innerHTML = html; return true; }
  /* Blur validation waits until a press is released, so an error appearing above a button cannot
     push the button away between mousedown and mouseup and swallow the click. */
  var pressing = false, afterPress = [];
  document.addEventListener("pointerdown", function () { pressing = true; }, true);
  function released() {
    if (!pressing) return;
    pressing = false;
    setTimeout(function () { var q = afterPress; afterPress = []; q.forEach(function (f) { f(); }); }, 0);
  }
  document.addEventListener("pointerup", released, true);
  document.addEventListener("pointercancel", released, true);
  function whenReleased(fn) { if (pressing) { if (afterPress.indexOf(fn) === -1) afterPress.push(fn); } else fn(); }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function aOrAn(w) { return (/^[aeiou]/i.test(w) ? "an " : "a ") + w; }
  // Live summaries for screen readers; quiet until start-up rendering is done.
  var booted = false;
  function say(el, text) { if (booted && el && el.textContent !== text) el.textContent = text; }

  /* ---------------------------------------------------------------- decoder */
  var decForm = $("[data-dec-form]"), decIn = $("#dec-in"), decOut = $("[data-dec-out]"), decLive = $("[data-dec-live]");
  var DEC_EX = ["6205-2RS1/C3", "6308-2Z", "30210", "22212 EK", "NU 2208 ECP", "7205 BEP", "51106", "1207 EKTN9", "6205DDUC3", "6205-2RSR-C3", "6205LLUC3"];
  $("[data-dec-examples]").innerHTML = chips(DEC_EX, "data-dec-ex");

  function summaryLine(r) {
    var bits = [r.name];
    if (SEALABLE[r.type]) bits.push(SEAL_TXT[r.seal || ""].toLowerCase());
    else if (r.seal) bits.push(SEAL_TXT[r.seal].toLowerCase());
    if (r.taper) bits.push("tapered bore");
    if (r.clr) bits.push(r.clr + " clearance");
    if (r.prec) bits.push("class " + r.prec.slice(1) + " precision");
    if (r.snap) bits.push(r.snap === "NR" ? "snap ring fitted" : "snap ring groove");
    return bits.join(", ") + ".";
  }

  function renderDecoder() {
    var v = decIn.value;
    var r;
    try { r = decode(v); } catch (e) {
      setHTML(decOut, '<div class="notice notice--warm">' + icon("warning-circle") + "<p>Something went wrong reading that number. Try it again without extra symbols.</p></div>");
      say(decLive, "We could not read that number.");
      return;
    }
    if (r.empty) {
      setHTML(decOut, '<div class="empty dec__empty">' + icon("barcode") + "<h3>Type a bearing number</h3><p>Start with the digits on the bearing’s face, for example 6205, then add the letters that follow.</p></div>");
      say(decLive, "");
      return;
    }
    var toks = '<ol class="tokens' + (r.tokens.length > 6 ? " tokens--dense" : "") + '" aria-label="Parts of ' + esc(r.raw) + '">' + r.tokens.map(function (t, i) {
      return '<li class="tok tok--' + t.kind + '" style="--i:' + i + '"><span class="tok__code mono">' + esc(t.code) + '</span><span class="tok__label">' + esc(t.label) + '</span><span class="tok__text">' + esc(t.text) + "</span></li>";
    }).join("") + "</ol>";

    if (!r.ok) {
      var hits = BS.search(r.raw, 3);
      setHTML(decOut, toks +
        '<div class="dsum dsum--miss"><div class="dsum__main"><h3 class="h4">We could not read “' + esc(clip(r.raw, 28)) + '” as a bearing number.</h3>' +
        '<p class="muted">Bearing numbers start with the type: 6 for deep groove, 7 angular contact, 3 tapered, 2 spherical, NU or NJ cylindrical, 5 thrust. Check for a letter O typed as zero, or leave out the brand name.</p></div>' +
        (hits.length ? '<div class="dsum__side"><p class="dsum__h">In our catalogue</p>' + hits.map(function (h) { return catRow(h.p); }).join("") + "</div>" :
          '<div class="dsum__side"><p class="dsum__h">Still stuck?</p><p class="small muted">Send us the number or a photo and a specialist will identify it.</p><a class="btn btn--sm" href="quick-order.html?pn=' + encodeURIComponent(r.raw) + '&amp;qty=1#rfq">Ask a specialist</a></div>') +
        "</div>");
      say(decLive, "We could not read " + r.raw + " as a bearing number." + (hits.length ? " " + BS.plural(hits.length, "close match", "close matches") + " in our catalogue." : ""));
      return;
    }

    var dimsHTML = "";
    if (r.d != null && r.D != null) {
      dimsHTML = '<dl class="dims"><div><dt>Bore d</dt><dd class="num">' + fmt(r.d, 2) + "<small>mm</small></dd></div><div><dt>Outer D</dt><dd class=\"num\">" + fmt(r.D, 3) + "<small>mm</small></dd></div><div><dt>Width B</dt><dd class=\"num\">" + fmt(r.B, 3) + "<small>mm</small></dd></div></dl>" +
        '<p class="tiny muted">' + (r.dimSrc === "iso" ? "Boundary dimensions from the ISO 15 tables." : "Dimensions from the matching part in our catalogue.") + "</p>";
    } else if (r.d != null) {
      dimsHTML = '<dl class="dims"><div><dt>' + (r.type === "needle" && r.B != null ? "Shaft" : "Bore d") + '</dt><dd class="num">' + fmt(r.d, 2) + "<small>mm</small></dd></div>" + (r.B != null ? '<div><dt>Width</dt><dd class="num">' + fmt(r.B, 2) + "<small>mm</small></dd></div>" : "") + "</dl>" +
        '<p class="tiny muted">The outer diameter and width depend on the series. Our team can confirm them from the maker’s tables.</p>';
    } else if (r.partial) {
      dimsHTML = '<p class="small muted">' + esc(r.partial) + "</p>";
    }
    var unk = r.unknown.length ? '<div class="notice notice--warm dsum__unk">' + icon("warning-circle") + "<p>We read the bearing but not <strong class=\"mono\">" + r.unknown.map(esc).join(", ") + "</strong>. It may be a maker-specific code. Ask us before you order a substitute.</p></div>" : "";

    var res = BS.search(r.raw, 6);
    var exact = res.filter(function (x) { return x.score >= 84; });
    var cat = catDecoded().filter(function (x) { return sameVersion(x.d, r); }).map(function (x) { return x.p; });
    var picks = [];
    exact.forEach(function (x) { if (picks.indexOf(x.p) === -1) picks.push(x.p); });
    cat.forEach(function (p) { if (picks.indexOf(p) === -1) picks.push(p); });
    var shopHref = picks.length ? BS.url(picks[0]) : "shop.html?q=" + encodeURIComponent(r.raw);
    var side = '<div class="dsum__side"><div class="dsum__ctas"><a class="btn" href="' + shopHref + '">Shop this part</a><button class="btn btn--quiet" type="button" data-to-xch>See equivalents</button></div>' +
      (picks.length ? '<p class="dsum__h">' + (picks.length === 1 ? "In stock here" : BS.plural(picks.length, "match", "matches") + " in our catalogue") + "</p>" + picks.slice(0, 3).map(function (p) { return catRow(p); }).join("") +
        (picks.length > 3 ? '<a class="more small" href="shop.html?q=' + encodeURIComponent(r.basic) + '">See all ' + picks.length + "</a>" : "") :
        '<p class="dsum__h">Not listed online yet</p><p class="small muted">We can source it. Ask for a price and a specialist replies within 2 working hours.</p><a class="more small" href="quick-order.html?pn=' + encodeURIComponent(r.raw) + '&amp;qty=1#rfq">Request a quote</a>') +
      "</div>";
    var fig = r.d != null && r.D != null ? frontView(r) : "";
    setHTML(decOut, toks + '<div class="dsum"><div class="dsum__main' + (fig ? " has-fig" : "") + '"><p class="dsum__h">In plain words</p><h3 class="dsum__title">' + esc(summaryLine(r)) + "</h3>" + dimsHTML + unk + fig + "</div>" + side + "</div>");
    shapeTokens();
    say(decLive, summaryLine(r) + (r.d != null && r.D != null ? " " + fmt(r.d, 2) + " by " + fmt(r.D, 3) + " by " + fmt(r.B, 3) + " mm." : "") + (r.unknown.length ? " Some letters were not recognised." : ""));
  }
  /* Front view drawn to the real bore and outside diameter. */
  function frontView(r) {
    var c = 100, Ro = 92, Ri = Math.max(8, Ro * r.d / r.D), gap = Ro - Ri;
    var t = gap * 0.26, rp = (Ro + Ri) / 2, roller = r.type !== "dgbb" && r.type !== "ac" && r.type !== "sab" && r.type !== "ac2" && r.type !== "tbb";
    var rb = Math.min(gap * 0.24, 16), n = Math.max(6, Math.min(24, Math.floor(Math.PI * rp / (rb * 1.32))));
    var balls = "";
    for (var i = 0; i < n; i++) {
      var a = i * 2 * Math.PI / n - Math.PI / 2, x = c + rp * Math.cos(a), y = c + rp * Math.sin(a);
      balls += roller ? '<rect x="' + (x - rb * 0.62).toFixed(1) + '" y="' + (y - rb).toFixed(1) + '" width="' + (rb * 1.24).toFixed(1) + '" height="' + (rb * 2).toFixed(1) + '" rx="' + (rb * 0.3).toFixed(1) + '" transform="rotate(' + (a * 180 / Math.PI + 90).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ')"/>' :
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rb.toFixed(1) + '"/>';
    }
    return '<figure class="dsum__fig"><svg viewBox="0 0 200 200" role="img" aria-label="Front view drawn to scale: ' + fmt(r.d, 2) + " mm bore in a " + fmt(r.D, 2) + ' mm outer ring">' +
      '<defs><radialGradient id="fv-ball" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#cfd4db"/><stop offset="1" stop-color="#6b727d"/></radialGradient></defs>' +
      '<circle cx="100" cy="100" r="' + (Ro - t / 2).toFixed(1) + '" fill="none" stroke="#c9ced6" stroke-width="' + t.toFixed(1) + '"/>' +
      '<circle cx="100" cy="100" r="' + (Ri + t / 2).toFixed(1) + '" fill="none" stroke="#c9ced6" stroke-width="' + t.toFixed(1) + '"/>' +
      '<circle cx="100" cy="100" r="' + Ro + '" fill="none" stroke="#8e949e" stroke-width="1"/><circle cx="100" cy="100" r="' + Ri.toFixed(1) + '" fill="none" stroke="#8e949e" stroke-width="1"/>' +
      '<g fill="url(#fv-ball)" stroke="#6b727d" stroke-width=".6">' + balls + "</g>" +
      '<line x1="' + (100 - Ri).toFixed(1) + '" y1="100" x2="' + (100 + Ri).toFixed(1) + '" y2="100" stroke="#1f4fd1" stroke-width="1.2" stroke-dasharray="3 3"/>' +
      '<text x="100" y="96" text-anchor="middle" font-family="Geist Mono, monospace" font-size="11" font-weight="600" fill="#1f4fd1">d ' + fmt(r.d, 2) + "</text>" +
      '</svg><figcaption class="tiny muted">Front view, to scale</figcaption></figure>';
  }
  /* When the tokens wrap onto a second row, round the ends of each row so every row reads as one strip. */
  function shapeTokens() {
    var items = $$(".tokens .tok", decOut), prevTop = null;
    items.forEach(function (li, i) {
      var top = li.offsetTop, next = items[i + 1];
      li.classList.toggle("is-rs", prevTop === null || top !== prevTop);
      li.classList.toggle("is-re", !next || next.offsetTop !== top);
      prevTop = top;
    });
  }
  window.addEventListener("resize", BS.debounce(shapeTokens, 120));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(shapeTokens);
  var renderDecoderSoon = BS.debounce(renderDecoder, 140);
  decIn.addEventListener("input", renderDecoderSoon);
  decForm.addEventListener("submit", function (e) { e.preventDefault(); renderDecoder(); });
  $("[data-dec-clear]").addEventListener("click", function () { decIn.value = ""; renderDecoder(); decIn.focus(); });
  decForm.addEventListener("click", function (e) {
    var b = e.target.closest("[data-dec-ex]");
    if (!b) return;
    decIn.value = b.getAttribute("data-dec-ex");
    renderDecoder();
  });
  decOut.addEventListener("click", function (e) {
    if (!e.target.closest("[data-to-xch]")) return;
    xchIn.value = decIn.value.trim();
    renderXch(true);
    scrollToId("interchange");
    setTimeout(function () { xchIn.focus({ preventScroll: true }); }, 450);
  });

  /* ------------------------------------------------------------ interchange */
  var xchForm = $("[data-xch-form]"), xchIn = $("#xch-in"), xchErr = $("[data-xch-err]"), xchOut = $("[data-xch-out]"), xchBasic = $("[data-xch-basic]"), xchLive = $("[data-xch-live]");
  var XCH_EX = ["6205DDU", "6206ZZC3", "6308-2Z/C3", "22212EAKE4", "30205JR", "NU205ET", "UCP 205"];
  $("[data-xch-examples]").innerHTML = chips(XCH_EX, "data-xch-ex");
  var xchTouched = false;

  function renderXch(fromUser) {
    var v = xchIn.value.trim();
    if (!v) {
      setHTML(xchBasic, "");
      if (fromUser) { setErr(xchIn, xchErr, "Enter a part number, for example 6205DDU."); }
      setHTML(xchOut, '<div class="empty">' + icon("arrows-left-right") + "<h3>Enter a part number</h3><p>Any brand works. Try 6205DDU from NSK or 6206-2Z from SKF.</p></div>");
      say(xchLive, "");
      return;
    }
    setErr(xchIn, xchErr, "");
    var r;
    try { r = decode(v); } catch (e) { r = { ok: false, raw: v, unknown: [v], tokens: [] }; }
    if (!r.ok) {
      var hits = BS.search(v, 4);
      setHTML(xchBasic, "");
      if (fromUser || xchTouched) setErr(xchIn, xchErr, "We could not read this as a bearing number. Check the digits after the brand name.");
      setHTML(xchOut, '<div class="xch__miss">' +
        (hits.length ? '<p class="xch__h">Closest catalogue matches for “' + esc(clip(v, 28)) + '”</p><div class="xch__rows">' + hits.map(function (h) { return catRow(h.p, { note: h.via ? "Listed as equivalent of " + esc(h.via) : "" }); }).join("") + "</div>" :
          '<div class="empty">' + icon("magnifying-glass") + "<h3>No equivalents for “" + esc(clip(v, 28)) + "”</h3><p>We could not read the number and nothing in the catalogue matches. Send it to us and we will find the part.</p>" +
          '<a class="btn btn--sm" href="quick-order.html?pn=' + encodeURIComponent(v) + '&amp;qty=1#rfq">Ask a specialist</a></div>') + "</div>");
      say(xchLive, "We could not read " + v + " as a bearing number. " + (hits.length ? BS.plural(hits.length, "close catalogue match", "close catalogue matches") + " shown." : "No catalogue matches."));
      return;
    }
    var feats = [];
    if (SEALABLE[r.type] || r.seal) feats.push(SEAL_TXT[r.seal || ""]);
    if (r.clr) feats.push(r.clr + " clearance");
    if (r.taper) feats.push("Tapered bore");
    if (r.prec) feats.push(r.prec + " precision");
    if (r.angle) feats.push({ B: "40°", A: "30°", AC: "25°", C: "15°" }[r.angle] + " contact angle");
    var size = r.d != null && r.D != null ? fmt(r.d, 2) + " × " + fmt(r.D, 3) + " × " + fmt(r.B, 3) + " mm" : r.d != null ? "Bore " + fmt(r.d, 2) + " mm" : "";
    setHTML(xchBasic, '<p class="xch__lbl">Basic designation</p><p class="xch__basicnum mono">' + esc(r.basic) + '</p><p class="xch__type">' + esc(r.name) + (size ? " · " + size : "") + "</p>" +
      (feats.length ? '<ul class="xch__feats">' + feats.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : ""));

    var eq = equivalents(r);
    var stockedN = eq.filter(function (x) { return x.p; }).length;
    var rowsHTML = eq.map(function (x) {
      var codeCell = x.code ? '<span class="mono xt__code">' + esc(x.code) + "</span>" : '<span class="muted small">No standard equivalent</span>';
      var buy = x.p ? '<div class="xt__buy" data-pid="' + esc(x.p.id) + '"><span class="xt__price">' + BS.priceHTML(x.p.price, x.p) + "</span>" +
          '<a class="xt__link small" href="' + BS.url(x.p) + '">' + esc(BS.stock(x.p).short) + "</a>" +
          '<button class="btn btn--sm btn--add" type="button" data-add="' + esc(x.p.id) + '" aria-label="Add ' + esc(x.name + " " + x.p.pn) + ' to bag">Add to bag</button></div>' :
        x.code ? '<a class="xt__ask small" href="quick-order.html?pn=' + encodeURIComponent(x.name + " " + x.code) + '&amp;qty=1#rfq">Ask for a price</a>' : "";
      return '<tr class="' + (x.entered ? "is-entered" : "") + (x.p ? " is-stocked" : "") + '"><th scope="row"><span class="xt__brand">' + esc(x.name) + "</span>" + (x.entered ? '<span class="badge badge--blue">' + (r.brand ? "You entered" : "Your number’s style") + "</span>" : "") + "</th>" +
        "<td>" + codeCell + (x.p && x.code && BS.norm(x.p.pn) !== BS.norm(x.code) ? '<span class="xt__also small muted">We stock it as ' + esc(x.p.pn) + "</span>" : "") + "</td><td>" + buy + "</td></tr>";
    }).join("");
    var vars = variants(r);
    var varHTML = vars.length ? '<div class="xch__vars"><p class="xch__h">Same size, other versions in stock</p><div class="xch__rows">' + vars.slice(0, 4).map(function (x) { return catRow(x.p, { note: esc(sealLabel(x.d)), sub: esc(BS.dims(x.p)) }); }).join("") + "</div></div>" : "";
    setHTML(xchOut, '<div class="xch__tablehead"><p class="xch__h">Equivalent designations</p><p class="small muted">' + (stockedN ? BS.plural(stockedN, "brand") + " in stock here" : "None in stock yet, we can source them") + "</p></div>" +
      '<div class="xt-wrap"><table class="xt"><thead><tr><th scope="col">Maker</th><th scope="col">Designation</th><th scope="col">At Bearingsetu</th></tr></thead><tbody>' + rowsHTML + "</tbody></table></div>" + varHTML +
      (r.unknown.length ? '<div class="notice notice--warm" style="margin-top:16px">' + icon("warning-circle") + "<p>We left out <strong class=\"mono\">" + r.unknown.map(esc).join(", ") + "</strong> because we could not read it. Check that code with us before you swap brands.</p></div>" : "") +
      (r.type === "srb" || r.type === "crb" || r.type === "ac" ? '<p class="tiny muted xch__fine">Cage and design letters differ most on roller and angular contact bearings. We show each maker’s standard current version.</p>' : ""));
    say(xchLive, "Basic designation " + r.basic + ", " + r.name.toLowerCase() + ". " + (stockedN ? BS.plural(stockedN, "brand") + " in stock here." : "None in stock yet."));
  }
  var renderXchSoon = BS.debounce(function () { renderXch(false); }, 160);
  xchIn.addEventListener("input", renderXchSoon);
  function xchRecheck() { renderXch(true); }
  xchIn.addEventListener("blur", function () { if (xchTouched) whenReleased(xchRecheck); });
  xchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    xchTouched = true;
    renderXch(true);
    var v = xchIn.value.trim();
    if (v && history.replaceState) history.replaceState(null, "", "?q=" + encodeURIComponent(v) + "#interchange");
  });
  xchForm.addEventListener("click", function (e) {
    var b = e.target.closest("[data-xch-ex]");
    if (!b) return;
    xchIn.value = b.getAttribute("data-xch-ex");
    renderXch(false);
  });

  function setErr(input, el, msg) {
    el.textContent = msg;
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  }

  /* ------------------------------------------------------------------ belt */
  var beltForm = $("[data-belt-form]"), secWrap = $("[data-belt-sec]");
  var bIn = { d1: $("#b-d1"), d2: $("#b-d2"), c: $("#b-c"), rpm: $("#b-rpm") };
  var beltSec = "B", beltTried = false, beltTouched = {};
  var SECS = ["Z", "A", "B", "C", "SPZ", "SPA", "SPB", "SPC"];
  var secHint = $("[data-sec-hint]");
  (function () {
    SECS.forEach(function (s, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      btn.setAttribute("data-sec", s);
      btn.setAttribute("aria-checked", s === beltSec ? "true" : "false");
      btn.tabIndex = s === beltSec ? 0 : -1;
      btn.textContent = s;
      btn.setAttribute("aria-label", s + ", " + (i >= 4 ? "wedge" : "classical") + " section");
      $('[data-secgrp="' + (i < 4 ? "c" : "w") + '"]', secWrap).appendChild(btn);
    });
  })();
  function secText(s) { var b = BELT[s]; return s + " section: " + b.w + " mm top width, smallest pulley " + b.min + " mm. " + (b.kind === "classical" ? "Sold by inside length in inches." : "Sold by pitch length in mm."); }
  function setSec(s, focus) {
    beltSec = s;
    $$("[data-sec]", secWrap).forEach(function (b) {
      var on = b.getAttribute("data-sec") === s;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    secHint.textContent = secText(s);
    renderBelt();
  }
  secHint.textContent = secText(beltSec);
  secWrap.addEventListener("click", function (e) { var b = e.target.closest("[data-sec]"); if (b) setSec(b.getAttribute("data-sec")); });
  secWrap.addEventListener("keydown", function (e) {
    var i = SECS.indexOf(beltSec), k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown") i = (i + 1) % SECS.length;
    else if (k === "ArrowLeft" || k === "ArrowUp") i = (i - 1 + SECS.length) % SECS.length;
    else if (k === "Home") i = 0;
    else if (k === "End") i = SECS.length - 1;
    else return;
    e.preventDefault();
    setSec(SECS[i], true);
  });

  function readBelt(showAll) {
    var v = { d1: num(bIn.d1.value), d2: num(bIn.d2.value), c: num(bIn.c.value), rpm: num(bIn.rpm.value) };
    var err = {};
    ["d1", "d2"].forEach(function (k) {
      if (v[k] == null) err[k] = "Enter the pitch diameter in mm.";
      else if (isNaN(v[k]) || v[k] <= 0) err[k] = "Enter a number above 0, for example 125.";
      else if (v[k] > 3000) err[k] = "That is larger than 3,000 mm. Check the units.";
    });
    if (v.c == null) err.c = "Enter the distance between pulley centres in mm.";
    else if (isNaN(v.c) || v.c <= 0) err.c = "Enter a number above 0, for example 500.";
    else if (!err.d1 && !err.d2 && v.c <= (v.d1 + v.d2) / 2) err.c = "The pulleys would overlap. Centre distance must be more than " + fmt((v.d1 + v.d2) / 2, 1) + " mm.";
    else if (v.c > 20000) err.c = "That is longer than 20 m. Check the units.";
    if (v.rpm != null && (isNaN(v.rpm) || v.rpm <= 0 || v.rpm > 20000)) err.rpm = "Enter a speed between 1 and 20,000 rpm, or leave it blank.";
    Object.keys(bIn).forEach(function (k) {
      var show = showAll || beltTouched[k];
      setErr(bIn[k], $("#" + bIn[k].id + "-err"), show && err[k] ? err[k] : "");
    });
    return { v: v, err: err, ok: !Object.keys(err).length };
  }

  var svgDraw = $("[data-belt-draw]"), beltRes = $("[data-belt-result]"), beltStats = $("[data-belt-stats]"), beltNotes = $("[data-belt-notes]"), beltMatch = $("[data-belt-match]");
  var beltSvg = $("[data-belt-svg]");
  function drawBelt(d1, d2, C, sec, ghost) {
    var compact = beltSvg.getBoundingClientRect().width < 520;
    var W = compact ? 380 : 640, H = compact ? 290 : 340, r1 = d1 / 2, r2 = d2 / 2;
    beltSvg.setAttribute("viewBox", "0 0 " + W + " " + H);
    beltSvg.classList.toggle("is-compact", compact);
    var s = Math.min((W - (compact ? 60 : 120)) / (C + r1 + r2), (H - 150) / (2 * Math.max(r1, r2)));
    var total = (C + r1 + r2) * s, left = (W - total) / 2;
    var x1 = left + r1 * s, x2 = x1 + C * s, cy = H / 2 - 20, R1 = r1 * s, R2 = r2 * s;
    var k = (r2 - r1) / C, nx = -k, ny = Math.sqrt(Math.max(0, 1 - k * k));
    function P(x, R, sy) { return [(x + R * nx).toFixed(2), (cy + sy * R * ny).toFixed(2)]; }
    var p1u = P(x1, R1, -1), p2u = P(x2, R2, -1), p2l = P(x2, R2, 1), p1l = P(x1, R1, 1);
    var span2 = 180 + 2 * Math.asin(k) * 180 / Math.PI, span1 = 360 - span2;
    var bw = Math.max(3, Math.min(9, BELT[sec].w * 0.42));
    var path = "M" + p1u + " L" + p2u + " A" + R2.toFixed(2) + " " + R2.toFixed(2) + " 0 " + (span2 > 180 ? 1 : 0) + " 1 " + p2l + " L" + p1l + " A" + R1.toFixed(2) + " " + R1.toFixed(2) + " 0 " + (span1 > 180 ? 1 : 0) + " 1 " + p1u + " Z";
    function pulley(x, R, d, label, dur, cls) {
      var spokes = "";
      var n = R > 40 ? 5 : 3;
      for (var i = 0; i < n; i++) {
        var a = i * 2 * Math.PI / n;
        spokes += '<line x1="' + (x + Math.cos(a) * R * 0.3).toFixed(1) + '" y1="' + (cy + Math.sin(a) * R * 0.3).toFixed(1) + '" x2="' + (x + Math.cos(a) * R * 0.72).toFixed(1) + '" y2="' + (cy + Math.sin(a) * R * 0.72).toFixed(1) + '"/>';
      }
      return '<g class="bp ' + cls + '">' +
        '<circle class="bp__rim" cx="' + x.toFixed(1) + '" cy="' + cy + '" r="' + Math.max(4, R - bw / 2).toFixed(1) + '"/>' +
        '<g class="bp__spin" style="--dur:' + dur.toFixed(2) + 's;transform-origin:' + x.toFixed(1) + "px " + cy + 'px">' +
          '<circle class="bp__web" cx="' + x.toFixed(1) + '" cy="' + cy + '" r="' + Math.max(3, R * 0.8).toFixed(1) + '"/>' + spokes +
        "</g>" +
        '<circle class="bp__hub" cx="' + x.toFixed(1) + '" cy="' + cy + '" r="' + Math.max(3, R * 0.26).toFixed(1) + '"/>' +
        '<circle class="bp__bore" cx="' + x.toFixed(1) + '" cy="' + cy + '" r="' + Math.max(1.5, R * 0.1).toFixed(1) + '"/>' +
        '<text class="bp__lbl" x="' + x.toFixed(1) + '" y="' + (cy - Math.max(R1, R2) - 30).toFixed(1) + '" text-anchor="middle">' + label + '</text>' +
        '<text class="bp__dim" x="' + x.toFixed(1) + '" y="' + (cy - Math.max(R1, R2) - 13).toFixed(1) + '" text-anchor="middle">⌀ ' + fmt(d, 1) + "</text></g>";
    }
    var T1 = 4, T2 = T1 * d2 / d1;
    var rim = Math.PI * 2 * R1 / T1;
    var dimY = cy + Math.max(R1, R2) + 34;
    svgDraw.setAttribute("class", ghost ? "is-ghost" : "");
    svgDraw.innerHTML =
      '<line class="bd__axis" x1="' + (x1 - R1 - 14).toFixed(1) + '" y1="' + cy + '" x2="' + (x2 + R2 + 14).toFixed(1) + '" y2="' + cy + '"/>' +
      pulley(x1, R1, d1, "Driver", T1, "bp--driver") + pulley(x2, R2, d2, "Driven", T2, "bp--driven") +
      '<path class="bd__belt" d="' + path + '" style="stroke-width:' + bw.toFixed(1) + 'px"/>' +
      '<path class="bd__run" d="' + path + '" style="stroke-width:' + Math.max(1.5, bw * 0.45).toFixed(1) + "px;--beltdur:" + (26 / rim).toFixed(3) + 's"/>' +
      '<g class="bd__dim"><line x1="' + x1.toFixed(1) + '" y1="' + (dimY - 10) + '" x2="' + x1.toFixed(1) + '" y2="' + (dimY + 6) + '"/><line x1="' + x2.toFixed(1) + '" y1="' + (dimY - 10) + '" x2="' + x2.toFixed(1) + '" y2="' + (dimY + 6) + '"/>' +
      '<line x1="' + x1.toFixed(1) + '" y1="' + dimY + '" x2="' + x2.toFixed(1) + '" y2="' + dimY + '"/>' +
      '<path d="M' + (x1 + 7).toFixed(1) + " " + (dimY - 4) + "L" + x1.toFixed(1) + " " + dimY + "L" + (x1 + 7).toFixed(1) + " " + (dimY + 4) + '"/><path d="M' + (x2 - 7).toFixed(1) + " " + (dimY - 4) + "L" + x2.toFixed(1) + " " + dimY + "L" + (x2 - 7).toFixed(1) + " " + (dimY + 4) + '"/>' +
      '<text x="' + ((x1 + x2) / 2).toFixed(1) + '" y="' + (dimY + 20) + '" text-anchor="middle">C ' + fmt(C, 1) + " mm</text></g>";
  }

  function beltProducts(sec) {
    return BS.products.filter(function (p) {
      if (p.sub !== "classical-v" && p.sub !== "wedge-v") return false;
      var a = (p.attrs || []).filter(function (x) { return x[0] === "Section"; })[0];
      var s = a ? a[1] : "";
      return s === sec || (sec === "SPA" && s === "XPA") || (sec === "SPZ" && s === "XPZ") || (sec === "SPB" && s === "XPB");
    }).map(function (p) {
      var a = (p.attrs || []).filter(function (x) { return x[0] === "Pitch length"; })[0];
      return { p: p, Lp: a ? parseFloat(a[1]) : null };
    }).filter(function (x) { return x.Lp; });
  }

  var lastBelt = null;
  function renderBelt(showAll) {
    var rd = readBelt(showAll || beltTried);
    var v = rd.v;
    if (!rd.ok) {
      var d1 = v.d1 > 0 ? v.d1 : 125, d2 = v.d2 > 0 ? v.d2 : 250;
      var c = v.c > (d1 + d2) / 2 ? v.c : (d1 + d2) * 1.2;
      drawBelt(Math.min(d1, 3000), Math.min(d2, 3000), Math.min(c, 20000), beltSec, true);
      var first = rd.err.c || rd.err.d1 || rd.err.d2 || rd.err.rpm || "";
      setHTML(beltRes, '<p class="belt__label">Nearest standard belt</p><p class="belt__code belt__code--wait">' + beltSec + ' <span>…</span></p><p class="belt__sub">' + esc(first) + "</p>");
      setHTML(beltStats, "");
      setHTML(beltNotes, showAll || beltTried ? '<div class="notice notice--warm">' + icon("warning-circle") + "<p>" + esc(rd.err.c || rd.err.d1 || rd.err.d2 || rd.err.rpm) + "</p></div>" : "");
      setHTML(beltMatch, "");
      lastBelt = null;
      return;
    }
    var res = beltCalc(beltSec, v.d1, v.d2, v.c, v.rpm);
    lastBelt = res;
    drawBelt(v.d1, v.d2, v.c, beltSec, false);
    var std = res.std;
    setHTML(beltRes, '<p class="belt__label">Nearest standard belt</p><p class="belt__code mono">' + esc(std.code) + "</p>" +
      '<p class="belt__sub">' + (res.kind === "classical" ? "Inside length " + std.inch + " in (" + fmt(std.Li, 0) + " mm), pitch length " + fmt(std.Lp, 0) + " mm. Also written " + esc(std.alt) + "." : "Pitch length " + fmt(std.Lp, 0) + " mm, from the ISO 4184 standard series.") + "</p>");
    var dC = std.C != null ? std.C - v.c : null;
    beltStats.innerHTML =
      '<div><dt>Pitch length needed</dt><dd class="num">' + fmt(res.L, 0) + "<small>mm</small></dd></div>" +
      '<div><dt>Speed ratio</dt><dd class="num">1 : ' + res.ratio.toFixed(2) + "</dd></div>" +
      '<div><dt>Wrap on small pulley</dt><dd class="num">' + res.wrap.toFixed(1) + "°</dd></div>" +
      '<div><dt>Belt speed</dt><dd class="num">' + (res.v != null ? fmt(res.v, 1) + "<small>m/s</small>" : '<span class="stats__na">Add rpm</span>') + "</dd></div>" +
      '<div><dt>Centre distance with ' + esc(std.code) + '</dt><dd class="num">' + (std.C != null ? fmt(std.C, 0) + "<small>mm" + (dC != null && Math.abs(dC) >= 1 ? ", " + (dC > 0 ? "+" : "−") + fmt(Math.abs(dC), 0) : "") + "</small>" : '<span class="stats__na">Not possible</span>') + "</dd></div>";
    var notes = [];
    if (std.out) notes.push(["warm", "The length needed is outside the usual " + beltSec + " range. Check the section, or ask us about made-to-length belts."]);
    if (res.small < res.min) notes.push(["warm", "The " + beltSec + " section needs a pulley of at least " + res.min + " mm pitch diameter. A smaller pulley bends the belt too hard and shortens its life."]);
    if (res.wrap < 120) notes.push(["warm", "Wrap on the small pulley is under 120°, so the belt is likely to slip. Increase the centre distance or add a jockey pulley."]);
    if (res.v != null && res.kind === "classical" && res.v > 30) notes.push(["warm", "Belt speed is above 30 m/s, the limit for classical belts. Use a wedge belt or smaller pulleys."]);
    if (res.v != null && res.kind === "wedge" && res.v > 40) notes.push(["warm", "Belt speed is above 40 m/s, the limit for wrapped wedge belts. Ask us about raw-edge belts."]);
    var sum = v.d1 + v.d2;
    if (v.c < 0.7 * sum) notes.push(["blue", "Centre distance is short, under 0.7 × (D + d). Check the belt maker’s power rating for this wrap."]);
    else if (v.c > 2 * sum) notes.push(["blue", "Centre distance is long, over 2 × (D + d). Long drives can whip; tension carefully or add a jockey pulley."]);
    if (!notes.length) notes.push(["green", "Drive geometry looks healthy. Leave room on the motor base to fit and tension the belt."]);
    setHTML(beltNotes, notes.map(function (n) { return '<div class="notice' + (n[0] === "blue" ? "" : " notice--" + n[0]) + '">' + icon(n[0] === "green" ? "check-circle" : n[0] === "warm" ? "warning-circle" : "info") + "<p>" + esc(n[1]) + "</p></div>"; }).join(""));

    var list = beltProducts(beltSec).sort(function (a, b) { return Math.abs(a.Lp - std.Lp) - Math.abs(b.Lp - std.Lp); }).slice(0, 3);
    var rfq = "quick-order.html?pn=" + encodeURIComponent(std.code) + "&amp;qty=" + (v.d1 > 0 ? 2 : 1) + "#rfq";
    if (!list.length) {
      setHTML(beltMatch, '<div class="empty belt__empty">' + icon("package") + "<h3>No " + esc(beltSec) + " belts listed online yet</h3><p>We can supply " + esc(std.code) + " and matched sets. Ask for a price and we reply within 2 working hours.</p>" +
        '<a class="btn btn--sm" href="' + rfq + '">Request ' + esc(std.code) + "</a></div>");
      return;
    }
    var exact = list[0].Lp === std.Lp || (res.kind === "classical" && BS.norm(list[0].p.pn) === BS.norm(std.alt));
    setHTML(beltMatch, '<div class="row-head belt__mh"><h3 class="h4">' + (exact ? "In stock in this section" : "Closest " + esc(beltSec) + " belts we stock") + '</h3><a class="more small" href="' + rfq + '">' + (exact ? "Need a matched set? Ask us" : "Request " + esc(std.code)) + "</a></div>" +
      '<div class="belt__rows">' + list.map(function (x) {
        var diff = x.Lp - res.L;
        var note = Math.abs(x.Lp - std.Lp) < 1 ? "Nearest standard size" : "Pitch length " + fmt(x.Lp, 0) + " mm, " + (diff > 0 ? "+" : "−") + fmt(Math.abs(diff), 0) + " mm";
        return catRow(x.p, { note: esc(note) });
      }).join("") + "</div>");
  }
  function beltRecheck() { renderBelt(); }
  var beltW = 0;
  window.addEventListener("resize", BS.debounce(function () {
    var w = beltSvg.getBoundingClientRect().width;
    if ((w < 520) !== (beltW < 520)) renderBelt();
    beltW = w;
  }, 150));
  Object.keys(bIn).forEach(function (k) {
    bIn[k].addEventListener("input", BS.debounce(function () { renderBelt(); }, 120));
    // Errors show on submit, then on blur once the person has tried to calculate.
    bIn[k].addEventListener("blur", function () { if (beltTried) { beltTouched[k] = true; whenReleased(beltRecheck); } });
  });
  beltForm.addEventListener("submit", function (e) {
    e.preventDefault();
    beltTried = true;
    renderBelt(true);
    var bad = $('[aria-invalid="true"]', beltForm);
    if (bad) bad.focus();
  });
  $("[data-belt-reset]").addEventListener("click", function () {
    bIn.d1.value = "125"; bIn.d2.value = "250"; bIn.c.value = "500"; bIn.rpm.value = "1440";
    beltTried = false; beltTouched = {};
    setSec("B");
  });

  /* ---------------------------------------------------------------- grease */
  var grForm = $("[data-gr-form]"), grMode = "pn", grTried = false, grTouched = {};
  var gIn = { pn: $("#g-pn"), D: $("#g-D"), B: $("#g-B"), stroke: $("#g-stroke") };
  var grRes = $("[data-gr-result]"), grFound = $("[data-gr-found]"), grRecs = $("[data-gr-recs]");
  var GR_HINT = grFound.textContent;
  $("[data-gr-mode]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode]");
    if (!b) return;
    setGrMode(b.getAttribute("data-mode"));
  });
  function setGrMode(m) {
    grMode = m;
    $$("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mode") === m ? "true" : "false"); });
    $$("[data-gr-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-gr-pane") !== m; });
    renderGrease();
  }
  function readGrease(showAll) {
    var err = {}, D = null, B = null, label = "", r = null;
    if (grMode === "pn") {
      var v = gIn.pn.value.trim();
      if (!v) err.pn = "Enter a bearing number, for example 6310.";
      else {
        r = decode(v);
        if (!r.ok) err.pn = "We could not read this number. Switch to Size and enter D and B.";
        else if (r.D == null || r.B == null) err.pn = "We know this is " + aOrAn(r.name.toLowerCase()) + " but not its outer diameter and width. Switch to Size and enter D and B.";
        else { D = r.D; B = r.B; label = r.basic; }
      }
    } else {
      D = num(gIn.D.value); B = num(gIn.B.value);
      if (D == null) err.D = "Enter the outside diameter in mm.";
      else if (isNaN(D) || D <= 0 || D > 2000) err.D = "Enter a diameter between 1 and 2,000 mm.";
      if (B == null) err.B = "Enter the width in mm.";
      else if (isNaN(B) || B <= 0 || B > 600) err.B = "Enter a width between 1 and 600 mm.";
      else if (!err.D && B >= D) err.B = "Width is usually much smaller than the outside diameter. Check the values.";
      label = D > 0 && B > 0 ? "D " + fmt(D, 1) + " × B " + fmt(B, 1) + " mm" : "";
    }
    var st = num(gIn.stroke.value);
    if (st == null) err.stroke = "Enter the grams per stroke. 1.5 g is typical.";
    else if (isNaN(st) || st <= 0 || st > 50) err.stroke = "Enter a value between 0.1 and 50 g.";
    Object.keys(gIn).forEach(function (k) {
      var el = $("#" + gIn[k].id + "-err");
      setErr(gIn[k], el, (showAll || grTouched[k]) && err[k] ? err[k] : "");
    });
    if (grMode === "pn") {
      grFound.textContent = r && r.ok && r.D != null ? r.basic + ": " + fmt(r.d, 2) + " × " + fmt(r.D, 3) + " × " + fmt(r.B, 3) + " mm, " + (r.dimSrc === "iso" ? "from ISO tables." : "from our catalogue.") : GR_HINT;
    }
    var relevant = grMode === "pn" ? ["pn", "stroke"] : ["D", "B", "stroke"];
    var ok = relevant.every(function (k) { return !err[k]; });
    return { ok: ok, D: D, B: B, st: st, label: label, r: r, err: err };
  }
  function renderGrease(showAll) {
    var g = readGrease(showAll || grTried);
    if (!g.ok) {
      var msg = g.err.pn || g.err.D || g.err.B || g.err.stroke;
      setHTML(grRes, '<p class="gr__label">Relubrication quantity</p><p class="gr__big gr__big--wait">0<small>g</small></p><p class="gr__sub">' + esc(msg || "Enter a bearing to see the amount.") + "</p>");
      return;
    }
    var G = 0.005 * g.D * g.B;
    var strokes = Math.max(1, Math.round(G / g.st));
    var shown = Math.min(strokes, 40);
    var dots = "";
    for (var i = 0; i < shown; i++) dots += '<span style="--i:' + i + '"></span>';
    setHTML(grRes, '<p class="gr__label">Relubrication quantity' + (g.label ? " for " + esc(g.label) : "") + "</p>" +
      '<p class="gr__big num">' + fmt(G, G < 10 ? 1 : 0) + "<small>g</small></p>" +
      '<p class="gr__strokes"><strong>About ' + fmt(strokes, 0) + (strokes === 1 ? " stroke" : " strokes") + "</strong> of a " + fmt(g.st, 2) + " g grease gun.</p>" +
      '<div class="gr__dots" aria-hidden="true">' + dots + (strokes > 40 ? '<em>+' + fmt(strokes - 40, 0) + "</em>" : "") + "</div>" +
      '<p class="gr__sub">0.005 × ' + fmt(g.D, 1) + " × " + fmt(g.B, 1) + " = " + fmt(G, 2) + " g. Pump slowly with the machine running where it is safe, so grease spreads evenly.</p>");
    renderGreaseRecs(g);
  }
  function renderGreaseRecs(g) {
    var heavy = g.r && (g.r.type === "srb" || g.r.type === "trb" || g.r.type === "crb") || g.D >= 100;
    var picks = [
      ["skf-lgmt-2-1kg", "Everyday choice", "Motors, pumps, fans and conveyors."],
      ["skf-lgep-2-1kg", "Heavy load and shock", "Crushers, gearboxes, vibrating screens."],
      ["skf-lghp-2-1kg", "Hot running", "Electric motors and dryers up to 150 °C."],
      ["skf-1077600", "Grease gun", "Lever gun for 400 g cartridges."]
    ];
    if (heavy) picks = [picks[1], picks[0], picks[2], picks[3]];
    var cards = picks.map(function (x) { return [BS.byId(x[0]), x[1], x[2]]; }).filter(function (x) { return x[0]; });
    if (!cards.length) {
      cards = BS.products.filter(function (p) { return p.sub === "greases"; }).slice(0, 3).map(function (p) { return [p, "Bearing grease", ""]; });
    }
    if (!cards.length) { setHTML(grRecs, ""); return; }
    setHTML(grRecs, '<div class="row-head"><h3 class="h3">Greases for this job. <span class="tone">' + (heavy ? "Heavy-duty first." : "Start with the everyday one.") + '</span></h3><a class="more" href="shop.html?cat=lubrication&amp;sub=greases">All greases</a></div>' +
      '<div class="recs">' + cards.map(function (x) {
        return '<div class="rec"><p class="rec__why"><strong>' + esc(x[1]) + "</strong>" + esc(x[2]) + "</p>" + catRow(x[0]) + "</div>";
      }).join("") + "</div>");
  }
  // The result is live, so a field shows its own error once the person has typed in it and left it.
  var grDirty = {};
  function grRecheck() { renderGrease(); }
  Object.keys(gIn).forEach(function (k) {
    gIn[k].addEventListener("input", function () { grDirty[k] = true; });
    gIn[k].addEventListener("input", BS.debounce(grRecheck, 140));
    gIn[k].addEventListener("blur", function () { if (grTried || grDirty[k]) { grTouched[k] = true; whenReleased(grRecheck); } });
  });
  function grSubmit() {
    grTried = true;
    renderGrease(true);
    var bad = $('[aria-invalid="true"]', grForm);
    if (bad && !bad.closest("[hidden]")) bad.focus();
  }
  grForm.addEventListener("submit", function (e) { e.preventDefault(); grSubmit(); });
  // No submit button (the result is live), so Enter would do nothing; treat it as a check.
  grForm.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); grSubmit(); }
  });

  /* ---------------------------------------------------------------- convert */
  var cvIn = $("#cv-in"), cvMm = $("#cv-mm"), cvInErr = $("#cv-in-err"), cvMmErr = $("#cv-mm-err"), cvInNote = $("[data-cv-in-note]"), cvMmNote = $("[data-cv-mm-note]"), cvLive = $("[data-cv-live]");
  var INCH_ROWS = [["1/2", 0.5, "UC201-8"], ["5/8", 0.625, "UC202-10"], ["3/4", 0.75, "UC204-12"], ["1", 1, "UC205-16"], ["1-1/4", 1.25, "UC206-20"], ["1-1/2", 1.5, "UC208-24"], ["2", 2, "UC211-32"]];
  $("[data-cv-rows]").innerHTML = INCH_ROWS.map(function (r) {
    return '<tr data-cv-row="' + r[0] + '"><th scope="row" class="num">' + r[0] + ' in</th><td class="r num">' + fmt(r[1] * 25.4, 3) + '</td><td class="mono">' + r[2] + '</td><td class="r"><button class="btn btn--sm btn--quiet" type="button" data-cv-load="' + r[0] + '" aria-label="Load ' + r[0] + ' inch into the converter">Use</button></td></tr>';
  }).join("");
  function insertFor(mm) { for (var i = 0; i < INCH_ROWS.length; i++) if (Math.abs(INCH_ROWS[i][1] * 25.4 - mm) < 0.02) return INCH_ROWS[i]; return null; }
  function markRow(mm) { $$("[data-cv-row]").forEach(function (tr) { var r = INCH_ROWS.filter(function (x) { return x[0] === tr.getAttribute("data-cv-row"); })[0]; tr.classList.toggle("is-on", mm != null && Math.abs(r[1] * 25.4 - mm) < 0.02); }); }
  function fromInch() {
    var x = parseInch(cvIn.value);
    setErr(cvMm, cvMmErr, "");
    if (x == null) { cvMm.value = ""; setErr(cvIn, cvInErr, ""); cvInNote.textContent = ""; cvMmNote.textContent = ""; markRow(null); return; }
    if (isNaN(x) || x <= 0 || x > 400) { setErr(cvIn, cvInErr, "Enter inches as 1.25, 1-1/4, 1 1/4 or 5/8."); cvInNote.textContent = ""; cvMmNote.textContent = ""; markRow(null); return; }
    setErr(cvIn, cvInErr, "");
    var mm = x * 25.4;
    cvMm.value = String(Number(mm.toFixed(3)));
    var isFrac = /\//.test(cvIn.value) || /[½¼¾⅛⅜⅝⅞]/.test(cvIn.value);
    var f = fracText(x), exact = Math.abs(parseInch(f) - x) < 1e-9;
    cvInNote.textContent = isFrac ? "= " + String(Number(x.toFixed(4))) + " in decimal" : exact ? (f !== String(x) ? "= " + f + " in" : "") : "Nearest 1/64: " + f + " in";
    var ins = insertFor(mm);
    cvMmNote.textContent = ins ? "Inch-bore insert " + ins[2] : "";
    markRow(mm);
    say(cvLive, cvIn.value.trim() + " inch is " + cvMm.value + " mm.");
  }
  function fromMm() {
    var v = num(cvMm.value);
    setErr(cvIn, cvInErr, "");
    if (v == null) { cvIn.value = ""; setErr(cvMm, cvMmErr, ""); cvInNote.textContent = ""; cvMmNote.textContent = ""; markRow(null); return; }
    if (isNaN(v) || v <= 0 || v > 10000) { setErr(cvMm, cvMmErr, "Enter millimetres as a number, for example 31.75."); cvInNote.textContent = ""; cvMmNote.textContent = ""; markRow(null); return; }
    setErr(cvMm, cvMmErr, "");
    var x = v / 25.4;
    cvIn.value = String(Number(x.toFixed(4)));
    var f = fracText(x), off = Math.abs(parseInch(f) * 25.4 - v);
    cvInNote.textContent = off < 0.005 ? "= " + f + " in exactly" : "Nearest 1/64: " + f + " in (" + fmt(off, 2) + " mm off)";
    var ins = insertFor(v);
    cvMmNote.textContent = ins ? "Inch-bore insert " + ins[2] : "";
    markRow(v);
    say(cvLive, cvMm.value.trim() + " mm is " + cvIn.value + " inch.");
  }
  cvIn.addEventListener("input", fromInch);
  cvMm.addEventListener("input", fromMm);
  $("[data-cv-form]").addEventListener("submit", function (e) { e.preventDefault(); });
  $("[data-cv-rows]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cv-load]");
    if (!b) return;
    cvIn.value = b.getAttribute("data-cv-load");
    fromInch();
    cvIn.focus();
  });

  /* ---------------------------------------------------------------- glossary */
  var sxQ = $("#sx-q"), sxList = $("[data-sx-list]"), sxGroups = $("[data-sx-groups]"), sxCount = $("[data-sx-count]"), sxGroup = 0;
  var SX_SORTED = SFX.slice().sort(function (a, b) { return a.g - b.g; });
  function sxGroupsRender() {
    var html = '<button class="sx__g" type="button" data-sxg="-1" aria-pressed="' + (sxGroup === -1) + '"><span>All codes</span><small>' + SFX.length + "</small></button>";
    GROUPS.forEach(function (g, i) {
      var n = SFX.filter(function (e) { return e.g === i; }).length;
      html += '<button class="sx__g" type="button" data-sxg="' + i + '" aria-pressed="' + (sxGroup === i) + '"><span>' + esc(g) + "</span><small>" + n + "</small></button>";
    });
    sxGroups.innerHTML = html;
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function sxMatch(e, q, qn) {
    if (!q) return true;
    return BS.norm(e.c).indexOf(qn) === 0 || (qn.length >= 2 && BS.norm(e.c).indexOf(qn) > -1) || e.m.toLowerCase().indexOf(q) > -1 || e.b.toLowerCase().indexOf(q) > -1 || GROUPS[e.g].toLowerCase().indexOf(q) > -1;
  }
  function sxRender() {
    var q = sxQ.value.trim().toLowerCase(), qn = BS.norm(q);
    var shown = 0, html = "";
    GROUPS.forEach(function (g, gi) {
      if (sxGroup !== -1 && sxGroup !== gi) return;
      var items = SX_SORTED.filter(function (e) { return e.g === gi && sxMatch(e, q, qn); });
      if (!items.length) return;
      shown += items.length;
      html += '<section class="sxg" aria-labelledby="sxg-' + gi + '"><h3 class="sxg__h" id="sxg-' + gi + '">' + esc(g) + " <small>" + items.length + '</small></h3><dl class="sxg__list">' +
        items.map(function (e) {
          return '<div class="sxi"><dt class="sxi__c mono">' + esc(e.c) + (e.pre ? '<span class="sxi__pre">prefix</span>' : "") + '</dt><dd class="sxi__m">' + esc(cap(e.m.replace(/^Prefix: /, ""))) + '<span class="sxi__b">' + esc(e.b) + "</span></dd></div>";
        }).join("") + "</dl></section>";
    });
    var total = sxGroup === -1 ? SFX.length : SFX.filter(function (e) { return e.g === sxGroup; }).length;
    if (!shown) {
      var raw = sxQ.value.trim();
      setHTML(sxList, '<div class="empty">' + icon("book-open") + "<h3>No codes match “" + esc(clip(raw, 24)) + "”</h3><p>Check the spelling, or paste the whole part number into the decoder to read it letter by letter.</p>" +
        '<div class="empty__ctas"><button class="btn btn--sm" type="button" data-sx-decode>Decode ' + esc(clip(raw, 18)) + '</button><button class="btn btn--sm btn--quiet" type="button" data-sx-reset>Show all codes</button></div></div>');
      sxCount.textContent = "No codes match.";
      return;
    }
    setHTML(sxList, html);
    sxCount.textContent = shown === total ? "Showing all " + total + " codes" + (sxGroup === -1 ? "." : " in " + GROUPS[sxGroup].toLowerCase() + ".") : "Showing " + shown + " of " + total + " codes.";
  }
  sxGroups.addEventListener("click", function (e) {
    var b = e.target.closest("[data-sxg]");
    if (!b) return;
    sxGroup = parseInt(b.getAttribute("data-sxg"), 10);
    sxGroupsRender();
    sxRender();
  });
  sxQ.addEventListener("input", BS.debounce(function () {
    if (sxQ.value.trim() && sxGroup !== -1) { sxGroup = -1; sxGroupsRender(); }
    sxRender();
  }, 80));
  sxList.addEventListener("click", function (e) {
    if (e.target.closest("[data-sx-reset]")) { sxQ.value = ""; sxGroup = -1; sxGroupsRender(); sxRender(); sxQ.focus(); return; }
    if (e.target.closest("[data-sx-decode]")) {
      decIn.value = sxQ.value.trim();
      renderDecoder();
      scrollToId("decoder");
      setTimeout(function () { decIn.focus({ preventScroll: true }); }, 450);
    }
  });

  /* ------------------------------------------------------------- local nav */
  var lnav = $("[data-lnav]"), lscroll = $("[data-lnav-scroll]");
  var links = $$("[data-lnav-link]");
  var ids = links.map(function (a) { return a.getAttribute("data-lnav-link"); });
  function setActive(id) {
    links.forEach(function (a) {
      var on = a.getAttribute("data-lnav-link") === id;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      if (on && lscroll.scrollWidth > lscroll.clientWidth + 2) {
        var l = a.offsetLeft - (lscroll.clientWidth - a.offsetWidth) / 2;
        lscroll.scrollTo({ left: Math.max(0, l), behavior: BS.reduceMotion ? "auto" : "smooth" });
      }
    });
  }
  function spy() {
    var probe = window.innerHeight * 0.35, cur = null;
    ids.forEach(function (id) { var el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= probe) cur = id; });
    var last = document.getElementById("suffixes");
    if (last && last.getBoundingClientRect().bottom < probe) cur = null;
    if (cur !== spy.cur) { spy.cur = cur; setActive(cur); }
  }
  var spyTick = false;
  window.addEventListener("scroll", function () {
    if (spyTick) return;
    spyTick = true;
    requestAnimationFrame(function () { spyTick = false; spy(); lnav.classList.toggle("is-stuck", lnav.getBoundingClientRect().top <= parseFloat(getComputedStyle(lnav).top) + 0.5); });
  }, { passive: true });
  function scrollToId(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: BS.reduceMotion ? "auto" : "smooth", block: "start" });
  }

  /* ------------------------------------------------------------- start up */
  var hash = location.hash.slice(1), hq = null;
  var qi = hash.indexOf("?");
  if (qi > -1) { try { hq = new URLSearchParams(hash.slice(qi + 1)).get("q"); } catch (e) { hq = null; } hash = hash.slice(0, qi); }
  var q = hq || BS.params().get("q");
  if (q) {
    q = q.slice(0, 40);
    if (hash === "decoder") decIn.value = q; else xchIn.value = q;
    if (!hash) hash = "interchange";
  }
  // Each tool starts on its own, so a fault in one never leaves the others blank.
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.error(e); } }
  safe(renderDecoder);
  safe(function () { renderXch(false); });
  safe(renderBelt);
  safe(renderGrease);
  safe(fromInch);
  safe(function () { sxGroupsRender(); sxRender(); });
  BS.on("prefs", function () { safe(renderDecoder); safe(function () { renderXch(false); }); safe(renderBelt); safe(renderGrease); });
  if (hash && document.getElementById(hash) && (qi > -1 || q)) {
    if (qi > -1 && history.replaceState) history.replaceState(null, "", (q ? "?q=" + encodeURIComponent(q) : location.search) + "#" + hash);
    requestAnimationFrame(function () { document.getElementById(hash).scrollIntoView({ block: "start" }); spy(); });
  }
  spy();
  BS.reveal();
  booted = true;
})();
