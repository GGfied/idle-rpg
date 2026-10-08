# Runbook: Inventory extras (drag-to-swap, "Use", ground items)
- **Status:** done
- **Started:** 2026-10-08
- **Last updated:** 2026-10-08
- **Owner:** main session

## Goal
Close the three gaps the inventory QA found (task #41):
- drag an item onto another slot to swap them;
- a "Use" option, for item-on-item and item-on-object. With no recipes yet this says "Nothing interesting happens.", and the plumbing is ready for cooking, fletching and similar skills later;
- items on the ground: Drop puts the item on the player's tile instead of deleting it. It is drawn there, can be picked up by tap or a "Take" menu option, and despawns after a while.

## Decisions
- USER 2026-10-08 05:06: "#41 sure proceed".
- Ground items are not saved, and they despawn on a tick timer (about 300 ticks = 3 min, the OSRS-like private drop time). Reloading clears them, so there is no save version bump.
- Despawn is counted in ticks, not wall-clock time, to keep the multiplayer path open.
- Drag-swap uses core `swapSlots` (it already exists). A long-press on phone still opens the context menu, so the drag must start after a move threshold and not after a hold.
- "Use" is an intent: `useItem(slot)` selects the item, and the next tap on an item, object or NPC sends `useItemOn(slot, target)`. Cancel by tapping the same item or empty space.
- The owners:
  - `items`: ground-item model and logic.
  - `graphics`: ground-item views.
  - `hud`: drag and Use UI.
  - `integrator`: store actions, tick and scene wiring.
  - `qa`: one slice per feature.

## Tasks
- [x] `items`: ground items in core/items (state, drop, take, tick despawn, stacking per tile, query by tile)
- [x] `graphics`: ground item views (icon on the tile, small pile when there are several, depth-sorted, tap target)
- [x] `hud`: drag-to-swap in the inventory grid (mouse + touch, after a move threshold), "Use" in the item menu, selected-item state shown, "Use X ->" cursor text
- [x] `integrator`: store actions `swapInventorySlots`, `useItem`, `useItemOn`, `cancelUse`, `takeGroundItem`; Drop → ground item; ground-items tick; scene views; "Take" in the tile/ground menu
- [x] `qa`: inventorySwap slice, useItem slice, groundItems slice (desktop + phone)

## Next step
HANDOFF 2026-10-08 05:55: only the GATE is left = item 9 in `2026-10-08-big-world.md` → "HANDOFF tasks".

(audit 2026-10-08) All 5 tasks are done and qa-proven (inventorySwap 11/11, useItem 21/21, groundItems 11/11, mutants red).
Only the shared GATE run is left (see `docs/qa-coverage.md` "Still open"), then Status → done. Known gaps, not blocking:
Use on a facility object, real-phone long-press while Use is active, ground items cleared on reload, piles/qty badge.

## Next step (older)
RESTART: wave 1 died at 04:55 when the old session hit its usage limit. Partial files exist (core/items/ground.ts,
render/groundItemViews.ts, the drag ghost in InventoryPanel). Re-dispatched, each agent finishing its own partial work.
Wave 1 (items, graphics, hud) is dispatched in parallel. When it reports, send the integrator the wiring, which it will queue after the axe onImpact wiring. Then run the 3 qa slices.

## Open questions / blockers
- None.

## Log
- 2026-10-08 (restart audit): all tasks confirmed ticked and qa-proven; Next step updated (only the GATE run left).
- 2026-10-08 (restart): qa useItem PASS 21/21, qa groundItems PASS 11/11 (both mutants red). All 3 qa slices done → runbook ready to close after the GATE run.
- 2026-10-08 (restart): qa inventorySwap PASS 11/11 desktop + phone (mutant red).
- 2026-10-08 (restart): `integrator` DONE. Ground items in GameState (not saved), game/ground.ts (dropSlot, takeGround walk+take, ground system last in SYSTEMS), take is all-or-nothing with an important "not enough space" line, useItemOn generic hook ("Nothing interesting happens."), useSelection reconciled in joined(), scene hitTest before tiles, long-press Take/Walk/Cancel, Use on NPC/object/tree. Own browser on desktop + phone: 13 checks, 0 errors. app 213 tests. Notes: no drop sound/vfx event (drop is a pure action); hud may simplify useItemState.ts. qa slices dispatched: inventorySwap :5201, useItem :5202, groundItems :5203.
- 2026-10-08 (restart): `graphics` ground views DONE: createGroundItemViews(scene, iso, {motion, iconUrl}) → {sync, hitTest(worldX, worldY) → id|null, destroy}; max 3 shown per tile, qty badge, depth -0.5 below figures, ~60x48 px hit area; fixed a pooled-view cull bug (uncullFromCamera in viewCull.ts, mutant red); 15 tests. Integrator dispatched with the full contract.
- 2026-10-08 (restart): `hud` DONE (partial work was already complete): drag after 8 px (slotDrag.ts) → swapInventorySlots; "Use" first in the menu (only if the store has useItem); selected ring; UseHint bar with a 44 px ✕; optional selectors in useItemState.ts. Store contract for the integrator: swapInventorySlots(a,b), useItem(slot), useItemOn(target {kind:'item',slot}|object|npc) → "Nothing interesting happens.", cancelUse(), useSelection {slot,itemId}|null cleared when that slot changes; scene: object/NPC tap while selected → useItemOn, ground tap → cancelUse. tsc/eslint clean, ui 30 tests. Not browser-checked (qa after wiring).
- 2026-10-08 (restart): `items` DONE. The killed run had already finished the code, so nothing changed. API from `@core/items`: GroundItem{id,itemId,qty,x,y,spawnTick,despawnTick}, GroundItemsState, emptyGroundItems, dropGroundItem(state,{itemId,qty,x,y,tick},registry) (stackables merge per tile and reset the timer), takeGroundItem(state,id) → Result<…,'notFound'> (the integrator re-drops what doesn't fit), groundItemsAt, tickGroundItems(state,tick), GROUND_ITEM_DESPAWN_TICKS=300, events groundItemDropped/Taken/Despawned. 33 tests; tsc/eslint/prettier clean. Runtime state only, not saved. Integrator waits for graphics views + hud.
- 2026-10-08 05:06: the user approved #41. Runbook created. Wave 1 dispatched: items (ground items), graphics (ground item views), hud (drag-swap + Use UI).
- 2026-10-08 10:19 CLOSED at the v0.1.2 release (0d7fcf6): remaining items shipped in v0.1.1/v0.1.2 and QA'd, or skipped by the user (marked [-]).
