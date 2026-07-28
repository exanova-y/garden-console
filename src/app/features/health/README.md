# health

The health surface combines HRT/medication interventions and mood
observations. It is usable without an account; records are stored in the
browser under the guest vault. Login merges guest data into the selected
account and saves the merged snapshot as an encrypted backup.

The HRT model reference is [hrt.mahiro.uk](https://hrt.mahiro.uk). The
console now uses the vendored route-specific PK kernel from the Oyama tracker
for estradiol, testosterone, and CPA. Concerta has a label-anchored population
estimate; NAC is not assigned a fabricated blood level.

The dose form mirrors the upstream interaction state machine: transfem and
transmasc route filtering, route-specific formulations, molecular-weight
equivalent doses, sublingual presets/custom hold time, gel sites, patch
release-rate/total-dose modes, planned wear, and patch removal. Hidden route
values are retained when toggling away and back, matching the original form.

The overview graph follows the upstream chart interaction: future events
expand the time domain and receive a `planned` marker; the x-axis shows dates or
times; hovering a curve snaps to the nearest sample and reports its timestamp
and modeled level.

Concerta uses a 22% immediate plus 78% osmotic Bateman model, with peaks around
2.5 h and 7 h in the 24-hour visualization. The dose selector permits 18 mg
plus 9 mg increments. Mood entries use score
colored contribution boxes and normalized unique hashtags with frequency-sized
display.
