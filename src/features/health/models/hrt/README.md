# HRT Kernel

Vendored from `xunxunProjects/Oyama-s-HRT-Tracker` at commit
`ef4ef028063531efb1fd96bc92d6ca3632670451`.

The console adapts its local health events into the upstream `Route`, `Ester`,
`ExtraKey`, and `DoseEvent` shapes, then uses `runSimulation` and the upstream
interpolation functions for the HRT graph.

Keep the upstream MIT license and algorithm attribution when distributing this
application. Changes to the kernel should be accompanied by model regression
tests and a source commit update here.
