// 趨勢延續推估模型（forecast.js）
// 基期：2026 年齡段（累計至今）。各年齡段淨變動因子由 2023→2025 全年實際變化推估，
// 內含死亡、遷出、流失與留人等實際因素；出生另以台中市粗出生率為基準推估。
// 遷入遷出不另加計（已包含在各段實際變化率中，避免重複計算）；台中市遷移數據僅作對照。
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Forecast = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var MIDPOINTS = [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77, 82, 87, 92];
  var CBR0 = 0.00443;        // 台中市 2025 年粗出生率約 4.4‰（出生 12,706 人／年底人口 2,868,465 人）
  var BIRTH_DECLINE = 0.985; // 出生率每年假設下降 1.5%（反映少子化趨勢）
  var DAMP_K = 30;           // 小年齡段變動因子向整體靠攏的權重（人數）
  var RHO_MIN = 0.85, RHO_MAX = 1.15;

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  // 由 19 段 [男, 女] 推算平均年齡（段中點加權，估算值）
  function avgFromBands(bands) {
    var tot = 0, w = 0;
    for (var i = 0; i < 19; i++) {
      var n = bands[i][0] + bands[i][1];
      tot += n; w += n * MIDPOINTS[i];
    }
    return tot > 0 ? w / tot : 0;
  }

  // 由 19 段推算中位數（段內均勻內插，估算值）
  function medianFromBands(bands) {
    var tot = 0;
    for (var i = 0; i < 19; i++) tot += bands[i][0] + bands[i][1];
    if (tot <= 0) return 0;
    var half = tot / 2, cum = 0;
    for (var j = 0; j < 19; j++) {
      var n = bands[j][0] + bands[j][1];
      if (cum + n >= half) {
        var lower = j === 18 ? 90 : j * 5;
        return n > 0 ? lower + 5 * (half - cum) / n : lower;
      }
      cum += n;
    }
    return 92;
  }

  // 青年占比：35 歲以下（含 35 歲）＝前 7 段＋35-39 段的 1/5（段內均勻假設）
  function youthFromBands(bands) {
    var tot = 0, y = 0;
    for (var i = 0; i < 19; i++) tot += bands[i][0] + bands[i][1];
    for (var j = 0; j < 7; j++) y += bands[j][0] + bands[j][1];
    y += 0.2 * (bands[7][0] + bands[7][1]);
    return tot > 0 ? y / tot * 100 : 0;
  }

  function entryFromBands(bands) {
    var rb = [];
    for (var i = 0; i < 19; i++) rb.push([Math.round(bands[i][0]), Math.round(bands[i][1])]);
    var m = 0, f = 0;
    for (var j = 0; j < 19; j++) { m += rb[j][0]; f += rb[j][1]; }
    return {
      male: m, female: f, total: m + f,
      avg_age: avgFromBands(rb), median: medianFromBands(rb), youth_pct: youthFromBands(rb),
      bands: rb, missing_birth_year: null, unspecified_gender: null, estimated: true
    };
  }

  // bands23 / bands25 / bands26：該範圍 2023、2025、2026 年的 19 段 [男, 女]
  // 回傳 {2027, 2030, 2035, 2040} 各年的推估 entry
  function projectScope(bands23, bands25, bands26) {
    var per = [0, 1].map(function (s) {
      var b23 = bands23.map(function (p) { return p[s]; });
      var b25 = bands25.map(function (p) { return p[s]; });
      var rhoAll = (sum(b23) > 0 && sum(b25) > 0) ? Math.sqrt(sum(b25) / sum(b23)) : 1;
      var rho = [];
      for (var i = 0; i < 19; i++) {
        if (i === 0) { rho.push(rhoAll); continue; }
        var E = 0.6 * b23[i] + 0.4 * b23[i - 1];
        var r = E > 0 ? Math.sqrt(b25[i] / E) : rhoAll;
        rho.push(clamp((E * r + DAMP_K * rhoAll) / (E + DAMP_K), RHO_MIN, RHO_MAX));
      }
      return { rhoAll: rhoAll, rho: rho };
    });
    var b0m = bands26[0][0], b0f = bands26[0][1];
    var maleShare0 = (b0m + b0f) > 0 ? b0m / (b0m + b0f) : 0.5;
    var cur = [bands26.map(function (p) { return p[0]; }), bands26.map(function (p) { return p[1]; })];
    var targets = { 2027: 1, 2030: 4, 2035: 9, 2040: 14 };
    var snaps = {};
    for (var step = 1; step <= 14; step++) {
      var year = 2026 + step;
      var total = sum(cur[0]) + sum(cur[1]);
      var births = CBR0 * Math.pow(BIRTH_DECLINE, step - 1) * total;
      // 變動因子隨時間向 1 收斂（每年收斂 5%），避免 2023→2025 短期波動被無限外推
      var decay = Math.pow(0.95, step - 1);
      var next = [[], []];
      for (var s = 0; s < 2; s++) {
        var old = cur[s], rho = per[s].rho, rhoAll = per[s].rhoAll;
        var rhoAllEff = 1 + (rhoAll - 1) * decay;
        var n = [];
        n[0] = rhoAllEff * 0.8 * old[0] + births * (s === 0 ? maleShare0 : (1 - maleShare0));
        for (var i = 1; i < 18; i++) {
          var rEff = 1 + (rho[i] - 1) * decay;
          n[i] = rEff * (0.8 * old[i] + 0.2 * old[i - 1]);
        }
        var rTop = 1 + (rho[18] - 1) * decay;
        n[18] = rTop * (old[18] + 0.2 * old[17]);
        next[s] = n;
      }
      cur = next;
      if (targets[year]) {
        var bands = [];
        for (var j = 0; j < 19; j++) bands.push([cur[0][j], cur[1][j]]);
        snaps[year] = entryFromBands(bands);
      }
    }
    return snaps;
  }

  // 多個大區的年齡段加總（用於照顧區合計）
  function sumBands(listOfBands) {
    var out = [];
    for (var i = 0; i < 19; i++) {
      var m = 0, f = 0;
      for (var k = 0; k < listOfBands.length; k++) { m += listOfBands[k][i][0]; f += listOfBands[k][i][1]; }
      out.push([m, f]);
    }
    return out;
  }

  return {
    projectScope: projectScope,
    sumBands: sumBands,
    avgFromBands: avgFromBands,
    medianFromBands: medianFromBands,
    youthFromBands: youthFromBands,
    entryFromBands: entryFromBands
  };
});
