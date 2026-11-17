/* AidGap - Neglect Score in JavaScript.
   Same maths as src/gap_score.py (percentile ranks, then a weighted sum), so the
   dashboard sliders can re-rank the crises live in the browser.            */

/* Percentile 0-100 with ties averaged (matches pandas rank(pct=True)).
   higherIsWorse=true  -> the biggest value gets 100
   higherIsWorse=false -> the smallest value gets 100                        */
function percentile(values, higherIsWorse) {
  const n = values.length;
  const order = values.map((_, i) => i).sort((a, b) =>
    higherIsWorse ? values[a] - values[b] : values[b] - values[a]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = avg;
    i = j + 1;
  }
  return ranks.map(r => (r / n) * 100);
}

/* w = {cov, per, scl} - any non-negative numbers, they are normalised to sum 1.
   Returns one object per crisis: {cov, per, scl, score, rank}                 */
function computeScores(crises, w) {
  const total = w.cov + w.per + w.scl || 1;
  const wc = w.cov / total, wp = w.per / total, ws = w.scl / total;
  const cov = percentile(crises.map(c => c.funding_pct), false);
  const per = percentile(crises.map(c => c.funding_per_person_usd), false);
  const scl = percentile(crises.map(c => c.people_in_need), true);
  const out = crises.map((c, i) => ({
    cov: cov[i], per: per[i], scl: scl[i],
    score: Math.round((wc * cov[i] + wp * per[i] + ws * scl[i]) * 10) / 10,
  }));
  // tied scores share the best rank (1, 2, 2, 4 ...) like gap_score.py
  out.forEach(o => { o.rank = 1 + out.filter(p => p.score > o.score).length; });
  return out;
}

if (typeof module !== "undefined") module.exports = { percentile, computeScores };
