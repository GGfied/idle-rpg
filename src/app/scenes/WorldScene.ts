import Phaser from 'phaser';
import type { Tile } from '@core/contracts';
import type { Preferences } from '@core/persistence';
import { bestTool } from '@core/equipment';
import { itemIds } from '@core/inventory';
import { getLevel, isSkillId, skillColor } from '@core/progression';
import { isDepleted } from '@core/skills';
import type { AudioSystem } from '@audio/index';
import { createGestureInput } from '@platform/input';
import type { GestureInput } from '@platform/input';
import {
  createPlayerView,
  PLAYER_LOOKS,
  createBuildingRenderer,
  createChunkRenderer,
  createWorldEdge,
  isInsideBuilding,
  isoProjection,
  setCameraInsets,
  setCameraZoom,
  setupCameraFor,
  createWaterOverlay,
  createGroundItemViews,
  PIXEL_HIT_KINDS,
  opaqueAtImage,
} from '@render/index';
import type {
  BuildingRenderer,
  GroundItemViews,
  WaterOverlay,
  Facing8,
  PlayerView,
  PlayerLookId,
  FigureLook,
} from '@render/index';
import {
  animateTreeFall,
  animateTreeRegrow,
  createPlayerAnimator,
  facingFromStep,
  nextAnimState,
} from '@render/animation';
import { createFlameFlicker } from '@render/animation';
import type { AnimState, FlameFlicker, PlayerAnimator } from '@render/animation';
import { startEffects, tilesInView } from '@render/effects';
import type { EffectRunner, TileRect } from '@render/effects';
import '@app/scenes/worldEffects';
import { LIMITS_DESKTOP, LIMITS_MOBILE, createVfx } from '@render/vfx';
import { setLabelKeepOuts } from '@render/index';
import { KEEP_OUT_SELECTORS, MIN_OPACITY, keepOutSet } from '@app/scenes/keepOutRects';
import type { Vfx } from '@render/vfx';
import { getMethod } from '@features/skills/fishing';
import type { FireState } from '@features/facilities';
import { playerAction } from '@app/game/playerAction';
import type { FireAction } from '@app/game/playerAction';
import { FIRE_HIT_KIND, createFireViews } from '@app/scenes/fireViews';
import type { FireViews } from '@app/scenes/fireViews';
import { CHUNK_SIZE, WORLD_DEF } from '@features/world';
import type { FishingSpotSpawn, ObjectSpawn, RockSpawn, TreeSpawn } from '@features/world';
import { startedLine } from '@app/game/gatherMessages';
import { playerAnimInput, rodCatchLanded } from '@app/scenes/animInput';
import { animatorImpactCounts, attemptLanded, swingImpactEvent } from '@app/scenes/swingClock';
import type { SessionSnap } from '@app/scenes/swingClock';
import { spotTile } from '@app/game/fishingSpots';
import { buildVfxContext, swingVfxEvent } from '@app/scenes/vfxContext';
import { createNodeViews } from '@app/scenes/nodeViews';
import type { NodeViews } from '@app/scenes/nodeViews';
import { isBuildingShell } from '@app/scenes/buildingShell';
import { createChunkViews } from '@app/scenes/chunkViews';
import type { ChunkViews } from '@app/scenes/chunkViews';
import { minZoomForWindow } from '@app/scenes/zoomLimit';
import { clientToTile, clientToWorld } from '@app/scenes/clientToTile';
import { objectAtPoint } from '@app/scenes/objectAtPoint';
import type { HitTarget, IsOpaqueAt } from '@app/scenes/objectAtPoint';
import { advanceTrail, renderPosition, snapTrail, startTrail } from '@app/scenes/renderTrail';
import type { Trail } from '@app/scenes/renderTrail';
import { applyVisualPrefs } from '@app/scenes/applyPrefs';
import { applyPlayerLook, lookIdFromPrefs } from '@app/scenes/playerLook';
import { clampCentreToDiamond, panScroll } from '@app/scenes/panCamera';
import { followOffset, hudInsets, withStackedAbove } from '@app/scenes/visibleArea';
import type { NpcInstance } from '@features/npc';
import { facilityMenu, npcMenu } from '@app/game/menus';
import { lockableOption, lockedReason } from '@app/game/menuLock';
import { flashEvent } from '@app/scenes/stopFlash';
import { CONTENT } from '@app/registry';
import { gatherNode } from '@app/game/gatherNode';
import type { AppEvent } from '@app/registry';
import type { AppState, AppStore, MenuOption } from '@app/store';

export interface SceneDeps {
  store: AppStore;
  /** Fraction [0, 1) of the way to the next tick (from core/engine's ticker). */
  alpha(): number;
  /** Number of the latest game tick, so the scene can tell a tick from any other store change. */
  tick(): number;
  audio: AudioSystem;
  /** Subscribe to each game tick's events. */
  onEvents(cb: (events: AppEvent[]) => void): () => void;
}

/** What a pointer can land on besides the ground. */
interface Hit {
  tree?: TreeSpawn;
  rock?: RockSpawn;
  spot?: FishingSpotSpawn;
  obj?: ObjectSpawn;
  npc?: NpcInstance;
  fire?: FireState;
}

const START_ZOOM = 1.5;
/** Chunks around the player that are drawn and given entity views. */
const WINDOW_RADIUS = 1;
/** Paint a chunk this many world px before it scrolls into view. */
const GROUND_MARGIN_PX = 160;
const CHUNK_GRID = {
  widthChunks: WORLD_DEF.widthChunks,
  heightChunks: WORLD_DEF.heightChunks,
  chunkSize: CHUNK_SIZE,
};

/** The world: draws what the store says, and turns pointer gestures into store intents. */
export class WorldScene extends Phaser.Scene {
  private readonly deps: SceneDeps;
  private player!: PlayerView;
  private views!: ChunkViews;
  private nodes?: NodeViews;
  /** Gather session after the previous tick (mining swings are read off what the tick did). */
  private fishToolKind: string | undefined;
  private prevSession: SessionSnap | null = null;
  private effects?: EffectRunner;
  private water?: WaterOverlay;
  private ground!: ReturnType<typeof createChunkRenderer>;
  private buildings?: BuildingRenderer;
  private groundItems?: GroundItemViews;
  private lastGround: unknown = null;
  private fireViews?: FireViews;
  /** One shared flame flicker for every fire view (ticked from animate, like the tree sway). */
  private flicker?: FlameFlicker;
  /** 'lighting' | 'cooking' | null this frame (read by the fire animation wiring). */
  private fireAction: FireAction | null = null;
  private lastFires: unknown = null;
  private targets: HitTarget<Hit>[] = [];
  private input$?: GestureInput;
  private unsubscribe?: () => void;
  private trail: Trail = startTrail({ x: 0, y: 0 }, 0);
  private cam!: Phaser.Cameras.Scene2D.Camera;
  private observer?: ResizeObserver;
  private mutations?: MutationObserver;
  private animator?: PlayerAnimator;
  private vfx?: Vfx;
  private animState: AnimState = 'idle';
  private offEvents?: () => void;
  private lastRecentre = 0;
  private wasGathering = false;
  private facing: Facing8 = 's';
  private prefs!: Preferences;
  private playerLook: PlayerLookId = 'player';

  constructor(deps: SceneDeps) {
    super('world');
    this.deps = deps;
  }

  create(): void {
    const { store } = this.deps;
    const state = store.getState();
    this.prefs = state.prefs;
    createWorldEdge(
      this,
      isoProjection,
      WORLD_DEF.widthChunks * CHUNK_SIZE,
      WORLD_DEF.heightChunks * CHUNK_SIZE,
      (x, y) => WORLD_DEF.terrainAt(x, y),
    );
    this.ground = createChunkRenderer(this, {
      ...CHUNK_GRID,
      skipWall: isBuildingShell,
      terrainAt: (x, y) => WORLD_DEF.terrainAt(x, y),
      motion: () => this.prefs.visuals.animations,
    });
    this.buildings = createBuildingRenderer(this, isoProjection, {
      motion: () => this.prefs.visuals.animations,
    });
    for (const b of WORLD_DEF.buildings) this.buildings.add(b);
    this.groundItems = createGroundItemViews(this, isoProjection, {
      motion: () => this.prefs.visuals.animations,
    });
    this.flicker = createFlameFlicker(() => this.prefs.visuals.animations);
    this.fireViews = createFireViews(this, this.flicker);
    this.water = createWaterOverlay(this, isoProjection, {
      kindAt: (x, y) => WORLD_DEF.terrainAt(x, y),
      motion: () => this.prefs.visuals.animations,
    });
    this.views = createChunkViews(this, {
      grid: CHUNK_GRID,
      radius: WINDOW_RADIUS,
      trees: [...CONTENT.trees.values()],
      objects: [...CONTENT.objects.values()],
      npcs: [...CONTENT.npcs.values()],
      isStump: (id) => {
        const node = this.deps.store.getState().game.gathering.nodes[id];
        return node !== undefined && isDepleted(node);
      },
    });
    this.nodes = createNodeViews(
      this,
      [...CONTENT.rocks.values()],
      [...CONTENT.fishingSpots.values()],
      (f) => spotTile(f, state.game.fishing),
      () => this.prefs.visuals.animations !== 'off',
    );
    for (const id of CONTENT.rocks.keys()) this.paintRock(id);
    this.ensureWindow(state.game.movement.position);

    this.playerLook = lookIdFromPrefs(state.prefs);
    this.player = createPlayerView(this, 'You', this.playerLook);
    this.buildAnimator(PLAYER_LOOKS[this.playerLook]);
    this.vfx = createVfx(
      this,
      window.innerWidth < 768 ? LIMITS_MOBILE : LIMITS_DESKTOP,
      skillColor,
      state.prefs.visuals.vfx,
    );
    applyVisualPrefs(state.prefs, { vfx: this.vfx, animator: this.animator });
    const p = state.game.movement.position;
    this.trail = startTrail(p, this.deps.tick());
    this.placePlayer(1);
    const cam = setupCameraFor(
      this,
      this.player.container,
      isoProjection,
      WORLD_DEF.widthTiles,
      WORLD_DEF.heightTiles,
    );
    setCameraZoom(cam, START_ZOOM);
    this.cam = cam;
    this.watchVisibleArea();

    this.syncFromState(state);
    this.offEvents = this.deps.onEvents((events) => this.onTickEvents(events));
    this.unsubscribe = store.subscribe((s) => {
      if (s.prefs !== this.prefs) {
        this.prefs = s.prefs;
        applyVisualPrefs(s.prefs, { vfx: this.vfx, animator: this.animator });
        this.applyLook(s.prefs);
      }
      this.syncFromState(s);
    });
    this.bindInput(cam);
    this.startEffects();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
  }

  /** Read-only handles for the DEV QA hook (`window.__idleRpg`); nothing in the game calls this. */
  debugHandles(): {
    camera: Phaser.Cameras.Scene2D.Camera | undefined;
    playerView: PlayerView | undefined;
    animator: PlayerAnimator | undefined;
    fireAction: FireAction | null;
    ground: { loaded: number; created: number };
  } {
    return {
      camera: this.cam,
      playerView: this.player,
      animator: this.animator,
      fireAction: this.fireAction,
      ground: { loaded: this.ground.loaded(), created: this.ground.created() },
    };
  }

  /** Placeholder rock art follows the node's depletion in game state. */
  private paintRock(nodeId: string): void {
    const node = this.deps.store.getState().game.gathering.nodes[nodeId];
    this.nodes?.setDepleted(nodeId, node !== undefined && isDepleted(node));
  }

  /** Per frame: only interpolates drawing between the previous and current tile. */
  override update(time: number): void {
    this.placePlayer(this.deps.alpha());
    this.ensureGround();
    this.animate(time);
    this.flicker?.update(time);
    this.effects?.frame(time);
  }

  /** The overlay rig for `look`. Every swing: one chat line + one sound, from the same impact moment. */
  private buildAnimator(look: FigureLook): void {
    this.animator = createPlayerAnimator(this, this.player, {
      mode: this.deps.store.getState().prefs.visuals.animations,
      look,
    });
    this.animator.onImpact = () => {
      const defId = this.deps.store.getState().game.gathering.session?.defId;
      const toolKind = defId ? CONTENT.gatherDefs.get(defId)?.toolKind : undefined;
      if (animatorImpactCounts(this.animState, toolKind)) this.swingImpact();
    };
  }

  private vfxContext(): ReturnType<typeof buildVfxContext> {
    const playerWorld = { x: this.player.container.x, y: this.player.container.y };
    return buildVfxContext(
      CONTENT,
      this.deps.store.getState().game,
      playerWorld,
      isoProjection.tileToWorld,
    );
  }

  /** One swing landed: the sound (by the skill of what is being gathered) and the chat line. */
  private swingImpact(
    defId: string | undefined = this.deps.store.getState().game.gathering.session?.defId,
    nodeId: string | undefined = this.deps.store.getState().game.gathering.session?.nodeId,
  ): void {
    const g = this.deps.store.getState();
    const skill = defId ? CONTENT.gatherDefs.get(defId)?.skill : undefined;
    this.deps.audio.handleEvent(swingImpactEvent(skill));
    this.vfx?.handleEvent(swingVfxEvent(skill, nodeId), this.vfxContext());
    const line = startedLine(defId);
    if (line) g.say(line);
  }

  /** Live look switch from the Settings pref: body redrawn, rig rebuilt (it caches the look). */
  private applyLook(prefs: Preferences): void {
    this.playerLook = applyPlayerLook(prefs, this.playerLook, {
      view: this.player,
      rebuildAnimator: (look) => {
        this.animator?.destroy();
        this.buildAnimator(look);
      },
    });
  }

  /** Per frame: pick the player's animation from plain state and advance it. */
  private animate(time: number): void {
    const g = this.deps.store.getState().game;
    const session = g.gathering.session;
    const moving = this.trail.from.x !== this.trail.to.x || this.trail.from.y !== this.trail.to.y;
    const fish = g.fishing.session;
    const { toolKind, ...animIn } = playerAnimInput({
      moving,
      gathering: session !== null,
      gatherToolKind: session ? CONTENT.gatherDefs.get(session.defId)?.toolKind : undefined,
      fishing: fish !== null,
      fishToolKind: fish ? getMethod(fish.defId, fish.method)?.def.toolKind : undefined,
      fireAction: playerAction(g),
    });
    this.fireAction = playerAction(g);
    this.animState = nextAnimState(this.animState, { ...animIn, toolKind });
    const level = (skill: string): number =>
      isSkillId(skill) ? getLevel(g.progression, skill) : 1;
    const tool = toolKind ? bestTool(CONTENT.tools, toolKind, itemIds(g.inventory), level) : null;
    this.animator?.setState(this.animState, {
      facing: this.facing,
      toolItemId: tool?.itemId,
      running: g.movement.running,
    });
    this.animator?.update(time);
  }

  private onTickEvents(events: AppEvent[]): void {
    const vfxCtx = this.vfxContext();
    this.tickMiningSwing(events);
    this.tickRodCatch(events);
    for (const e of events) {
      if (e.type === 'spotMoved') this.moveSpot(e.spotId, e.to);
      this.vfx?.handleEvent(flashEvent({ ...e }), vfxCtx);
      if (
        (e.type === 'nodeDepleted' || e.type === 'nodeRespawned') &&
        CONTENT.rocks.has(e.nodeId)
      ) {
        this.paintRock(e.nodeId);
      } else if (e.type === 'nodeDepleted') {
        const v = this.views.tree(e.nodeId);
        if (v) {
          const t = this.spawn(e.nodeId);
          const p = this.trail.to;
          const awayFrom = t ? { dx: t.x - p.x, dy: t.y - p.y } : undefined;
          void animateTreeFall(this, v, {}, { mode: this.prefs.visuals.animations, awayFrom });
        }
      } else if (e.type === 'nodeRespawned') {
        const v = this.views.tree(e.nodeId);
        if (v) void animateTreeRegrow(this, v, { mode: this.prefs.visuals.animations });
      }
    }
  }

  /** Mining: land a swing (sound + vfx + chat) on every attempt, read off the tick (the animator's mine impacts are ignored). */
  private tickMiningSwing(events: readonly AppEvent[]): void {
    const g = this.deps.store.getState().game;
    const post = g.gathering.session;
    const prev = this.prevSession;
    this.prevSession = post;
    const snap = post ?? prev;
    if (!snap || CONTENT.gatherDefs.get(snap.defId)?.toolKind !== 'pickaxe') return;
    if (attemptLanded(prev, post, events)) this.swingImpact(snap.defId, snap.nodeId);
  }

  /** A rod catch plays the reel/lift once; the session is read pre-clear via the last seen tool kind. */
  private tickRodCatch(events: readonly AppEvent[]): void {
    const fish = this.deps.store.getState().game.fishing.session;
    if (fish) this.fishToolKind = getMethod(fish.defId, fish.method)?.def.toolKind;
    if (rodCatchLanded(events, this.fishToolKind)) this.animator?.pulse('catch');
  }

  private moveSpot(spotId: string, index: number): void {
    const spawn = CONTENT.fishingSpots.get(spotId);
    const tile = spawn?.tiles[index];
    if (!spawn || !tile) return;
    this.nodes?.moveSpot(spotId, tile);
    this.targets = this.targets.map((t) => (t.ref.spot === spawn ? { ...t, tile } : t));
  }

  private placePlayer(alpha: number): void {
    const { x, y } = renderPosition(this.trail, alpha);
    // Interpolate in tile space, then project; setWorldPosition also re-sorts depth from the world px.
    const feet = isoProjection.tileToWorld(x, y);
    this.player.setWorldPosition(feet.x, feet.y);
  }

  /** Runs once per store change (every tick): moves tile targets, facing and stumps. */
  private syncFromState(s: AppState): void {
    const { game } = s;
    if (game.ground !== this.lastGround) {
      this.lastGround = game.ground;
      this.groundItems?.sync(game.ground.items);
    }
    this.fireViews?.sync(game.firemaking.fires, game.tick, game.firemaking.lighting);
    let newFire = false;
    if (game.firemaking.fires !== this.lastFires) {
      const known = new Set(((this.lastFires ?? []) as { id: string }[]).map((f) => f.id));
      newFire = game.firemaking.fires.some((f) => !known.has(f.id));
      this.lastFires = game.firemaking.fires;
      this.targets = [...this.targets.filter((t) => !t.ref.fire), ...this.fireTargets()];
    }
    const pos = game.movement.position;
    const before = this.trail;
    // A new fire lands on the tile the player just stepped off: snap, so no frame draws the body in the flames.
    this.trail = newFire
      ? snapTrail(before, pos, this.deps.tick())
      : advanceTrail(before, pos, this.deps.tick());
    this.ensureWindow(pos);
    this.buildings?.setInside(
      WORLD_DEF.buildings.find((b) => isInsideBuilding(b, pos.x, pos.y))?.id ?? null,
    );
    const sx = this.trail.to.x - this.trail.from.x;
    const sy = this.trail.to.y - this.trail.from.y;
    if (this.trail !== before && (sx !== 0 || sy !== 0)) this.facing = facingFromStep(sx, sy);
    const session = game.gathering.session;
    if (s.recentre !== this.lastRecentre || (session !== null && !this.wasGathering)) {
      this.lastRecentre = s.recentre;
      this.followPlayer();
    }
    this.wasGathering = session !== null;
    const tree = session ? this.spawn(session.nodeId) : undefined;
    if (tree && (tree.x !== pos.x || tree.y !== pos.y))
      this.facing = facingFromStep(tree.x - pos.x, tree.y - pos.y);
    const cookFire = game.cooking.session
      ? game.firemaking.fires.find((f) => f.id === game.cooking.session?.objectId)
      : undefined;
    const faceTile = cookFire?.tile ?? game.firemaking.lighting?.tile;
    if (faceTile && (faceTile.x !== pos.x || faceTile.y !== pos.y))
      this.facing = facingFromStep(faceTile.x - pos.x, faceTile.y - pos.y);
    const fishSpot = game.fishing.session
      ? CONTENT.fishingSpots.get(game.fishing.session.spotId)
      : undefined;
    if (fishSpot) {
      const t = spotTile(fishSpot, game.fishing);
      if (t.x !== pos.x || t.y !== pos.y) this.facing = facingFromStep(t.x - pos.x, t.y - pos.y);
    }
  }

  /**
   * The phone bottom sheet (or landscape side panel) overlays the canvas: keep the player centred in
   * the part that is still visible, and redo it on resize, sheet open/close and zoom.
   */
  private watchVisibleArea(): void {
    const apply = (): void => {
      const min = minZoomForWindow(this.cam, WINDOW_RADIUS, CHUNK_SIZE);
      if (this.cam.zoom < min) setCameraZoom(this.cam, min);
      const canvas = this.game.canvas.getBoundingClientRect();
      const hud = document.querySelector('#hud')?.getBoundingClientRect() ?? null;
      const chat = document.querySelector('.chatbox')?.getBoundingClientRect() ?? null;
      const insets = hudInsets(canvas, withStackedAbove(hud, chat));
      // hud publishes the live covered height as --hud-bottom-inset; it wins over the rect fallback.
      const v = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--hud-bottom-inset'),
      );
      if (Number.isFinite(v) && v >= 0) insets.bottom = Math.min(v, canvas.bottom - canvas.top);
      const o = followOffset(insets, this.cam.zoom);
      this.cam.setFollowOffset(o.x, o.y);
      setCameraInsets(this.cam, insets);
    };
    this.applyInsets = apply;
    apply();
    // Nameplate keep-outs: the render clamp re-reads this at most every 200 ms (labelKeepOut TTL), so the
    // DOM reads follow resize, sheet fold and chat open/close with no observer or per-frame layout.
    setLabelKeepOuts(() =>
      keepOutSet(
        this.game.canvas.getBoundingClientRect(),
        KEEP_OUT_SELECTORS.flatMap((q) =>
          [...document.querySelectorAll(q)]
            .filter((e) => parseFloat(getComputedStyle(e).opacity) >= MIN_OPACITY)
            .map((e) => e.getBoundingClientRect()),
        ),
      ),
    );
    this.scale.on(Phaser.Scale.Events.RESIZE, apply);
    window.addEventListener('resize', apply);
    this.observer = new ResizeObserver(apply);
    this.observer.observe(this.game.canvas);
    const hudEl = document.querySelector('#hud');
    if (hudEl) this.observer.observe(hudEl);
    const chatEl = document.querySelector('.chatbox');
    if (chatEl) this.observer.observe(chatEl);
    // A CSS variable or class change on :root / #hud (sheet or chat collapse) has no resize event.
    this.mutations = new MutationObserver(apply);
    this.mutations.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    if (hudEl)
      this.mutations.observe(hudEl, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'style', 'data-collapsed', 'data-settings'],
      });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, apply);
      window.removeEventListener('resize', apply);
      this.observer?.disconnect();
      this.mutations?.disconnect();
      setLabelKeepOuts(null);
    });
  }

  /** Ground RenderTextures only for chunks the camera can see (plus a margin); called every frame. */
  private ensureGround(): void {
    this.ground.ensureVisible(this.cam.worldView, GROUND_MARGIN_PX, (cx, cy) => {
      const c = WORLD_DEF.chunk(cx, cy);
      return c ? { cx: c.cx, cy: c.cy, tiles: c.tiles, size: CHUNK_SIZE } : undefined;
    });
  }

  /** Keep entity views for the chunks around a tile; rebuild hit targets when they change. */
  private ensureWindow(tile: Tile): void {
    if (!this.views.ensureAround(tile)) return;
    const l = this.views.loaded();
    this.effects?.chunksChanged(l);
    this.targets = [
      ...l.trees.map((t) => ({ tile: t, kind: t.defId, ref: { tree: t } })),
      ...[...CONTENT.rocks.values()].map((r) => ({
        tile: r,
        kind: r.defId,
        ref: { rock: r },
      })),
      ...[...CONTENT.fishingSpots.values()].map((f) => ({
        tile: spotTile(f, this.deps.store.getState().game.fishing),
        kind: f.defId,
        ref: { spot: f },
      })),
      ...l.objects.map((o) => ({ tile: o, kind: o.kind, ref: { obj: o } })),
      ...l.npcs.map((n) => ({ tile: n, kind: 'npc' as const, ref: { npc: n } })),
      ...this.fireTargets(),
    ];
  }

  /** Tap targets for the fires currently burning. */
  private fireTargets(): HitTarget<Hit>[] {
    return this.deps.store
      .getState()
      .game.firemaking.fires.map((f) => ({ tile: f.tile, kind: FIRE_HIT_KIND, ref: { fire: f } }));
  }

  /** Zoom, but never out past the point where the loaded chunks stop filling the view. */
  private zoomTo(zoom: number): void {
    const min = minZoomForWindow(this.cam, WINDOW_RADIUS, CHUNK_SIZE);
    setCameraZoom(this.cam, Math.max(zoom, min));
    this.applyInsets();
  }

  /** Pixel hit under a world point for trees and rocks (follows sway); undefined = stump, spot or other. */
  private readonly isOpaqueAt: IsOpaqueAt<Hit> = (target, wx, wy) => {
    const { tree, rock } = target.ref;
    const view = tree
      ? this.views.tree(tree.nodeId)
      : rock
        ? this.nodes?.get(rock.nodeId)
        : undefined;
    if (!view || !view.art.visible || !PIXEL_HIT_KINDS.has(target.kind)) return undefined;
    return opaqueAtImage(this.textures, view.container, view.art, wx, wy);
  };

  private applyInsets: () => void = () => undefined;

  /** Resume following the player (after a drag-pan), keeping the sheet-aware offset. */
  private followPlayer(): void {
    if (!this.cam) return;
    this.cam.startFollow(this.player.container, true, 0.15, 0.15);
    this.applyInsets();
  }

  private spawn(nodeId: string): { x: number; y: number } | undefined {
    return gatherNode(CONTENT, nodeId);
  }

  private bindInput(cam: Phaser.Cameras.Scene2D.Camera): void {
    const canvas = this.game.canvas;
    const input = createGestureInput(canvas);
    this.input$ = input;

    const tileAt = (clientX: number, clientY: number): Tile | null =>
      clientToTile(clientX, clientY, canvas.getBoundingClientRect(), canvas, cam, {
        width: WORLD_DEF.widthTiles,
        height: WORLD_DEF.heightTiles,
      });

    // Prefer an object whose drawn bounds (render hit bounds) hold the pointer over the ground tile.
    const hitAt = (clientX: number, clientY: number): Hit => {
      const w = clientToWorld(clientX, clientY, canvas.getBoundingClientRect(), canvas, cam);
      return (w && objectAtPoint(w.x, w.y, this.targets, this.isOpaqueAt)) || {};
    };

    // Ground items are drawn under figures but tapped first: they are small and sit on a tile.
    const groundAt = (clientX: number, clientY: number): string | null => {
      const w = clientToWorld(clientX, clientY, canvas.getBoundingClientRect(), canvas, cam);
      return (w && this.groundItems?.hitTest(w.x, w.y)) || null;
    };

    input.on('tap', ({ x, y }) => {
      const groundId = groundAt(x, y);
      if (groundId) {
        const store = this.deps.store.getState();
        store.closeMenu();
        store.cancelUse();
        store.takeGroundItem(groundId);
        return;
      }
      const hit = hitAt(x, y);
      const { tree, rock, spot, obj, npc, fire } = hit;
      const tile =
        tree ??
        rock ??
        (spot && spotTile(spot, this.deps.store.getState().game.fishing)) ??
        obj ??
        npc ??
        fire?.tile ??
        tileAt(x, y);
      if (!tile) return;
      const store = this.deps.store.getState();
      store.closeMenu();
      const at = isoProjection.tileToWorld(tile.x, tile.y);
      this.vfx?.clickMarker(
        at.x,
        at.y,
        tree || rock || spot || obj || npc || fire ? 'interact' : 'walk',
      );
      const using = store.useSelection !== null;
      if (using && (npc || obj || tree || rock || spot || fire)) {
        if (npc) store.useItemOn({ kind: 'npc', id: npc.spawnId });
        else
          store.useItemOn({
            kind: 'object',
            id: obj ? obj.objectId : (fire?.id ?? (tree ?? rock)?.nodeId ?? spot!.spotId),
          });
      } else if (npc) store.interactNpc(npc.spawnId);
      else if (obj) store.interactFacility(obj.objectId);
      else if (fire) store.cookOnFire(fire.id);
      else if (tree) store.interactTree(tree.nodeId);
      else if (rock) store.interactTree(rock.nodeId);
      else if (spot) store.interactSpot(spot.spotId);
      else {
        store.cancelUse();
        store.walkTo(tile);
        this.deps.audio.play('walkClick');
      }
    });

    input.on('longPress', ({ x, y }) => {
      const groundId = groundAt(x, y);
      const groundItem = groundId
        ? this.deps.store.getState().game.ground.items.find((g) => g.id === groundId)
        : undefined;
      if (groundId && groundItem) {
        const store = this.deps.store.getState();
        const name = CONTENT.items.get(groundItem.itemId)?.name ?? groundItem.itemId;
        store.openMenu({
          x,
          y,
          title: name,
          options: [
            { label: `Take ${name}`, onSelect: () => store.takeGroundItem(groundId) },
            {
              label: 'Walk here',
              onSelect: () => store.walkTo({ x: groundItem.x, y: groundItem.y }),
            },
            { label: 'Cancel', onSelect: () => undefined },
          ],
        });
        return;
      }
      const { tree, rock, spot, obj, npc, fire } = hitAt(x, y);
      const tile =
        tree ??
        rock ??
        (spot && spotTile(spot, this.deps.store.getState().game.fishing)) ??
        obj ??
        npc ??
        fire?.tile ??
        tileAt(x, y);
      if (!tile) return;
      const store = this.deps.store.getState();
      const options: MenuOption[] = npc
        ? npcMenu(npc.npcId).entries.map((e) => ({
            label: e.label,
            onSelect: () =>
              e.optionId
                ? store.interactNpc(npc.spawnId, e.optionId)
                : store.examineNpc(npc.spawnId),
          }))
        : fire
          ? facilityMenu('fire').entries.map((e) => ({
              label: e.label,
              onSelect: () => (e.optionId ? store.cookOnFire(fire.id) : store.examineFire()),
            }))
          : obj
            ? facilityMenu(obj.kind).entries.map((e) => ({
                label: e.label,
                onSelect: () =>
                  e.optionId
                    ? store.interactFacility(obj.objectId, e.optionId)
                    : store.examineFacility(obj.objectId),
              }))
            : spot
              ? [
                  lockableOption(
                    { label: spotVerb(spot), onSelect: () => store.interactSpot(spot.spotId) },
                    lockedReason(store.game, CONTENT, { kind: 'spot', defId: spot.defId }),
                    store.say,
                  ),
                  { label: 'Examine Fishing spot', onSelect: () => store.examineSpot(spot.spotId) },
                ]
              : rock
                ? [
                    lockableOption(
                      { label: 'Mine Rock', onSelect: () => store.interactTree(rock.nodeId) },
                      lockedReason(store.game, CONTENT, { kind: 'node', defId: rock.defId }),
                      store.say,
                    ),
                    { label: 'Examine Rock', onSelect: () => store.examineTree(rock.nodeId) },
                  ]
                : tree
                  ? [
                      lockableOption(
                        {
                          label: 'Chop down Tree',
                          onSelect: () => store.interactTree(tree.nodeId),
                        },
                        lockedReason(store.game, CONTENT, { kind: 'node', defId: tree.defId }),
                        store.say,
                      ),
                      { label: 'Examine Tree', onSelect: () => store.examineTree(tree.nodeId) },
                    ]
                  : [{ label: 'Walk here', onSelect: () => store.walkTo(tile) }];
      options.push({ label: 'Cancel', onSelect: () => undefined });
      store.openMenu({
        x,
        y,
        title: npc
          ? npcMenu(npc.npcId).title
          : fire
            ? facilityMenu('fire').title
            : obj
              ? facilityMenu(obj.kind).title
              : spot
                ? 'Fishing spot'
                : rock
                  ? rockTitle(rock)
                  : tree
                    ? treeTitle(tree)
                    : 'Ground',
        options,
      });
    });

    input.on('pinch', ({ scale }) => {
      this.zoomTo(cam.zoom * scale);
      this.applyInsets();
    });
    input.on('drag', ({ dx, dy }) => {
      // Client px -> canvas px, then drag the world: stop following and scroll by -d/zoom.
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      cam.stopFollow();
      const next = panScroll(
        { x: cam.scrollX, y: cam.scrollY },
        { dx: (dx * canvas.width) / rect.width, dy: (dy * canvas.height) / rect.height },
        { width: cam.width, height: cam.height, zoom: cam.zoom },
      );
      const box = isoProjection.worldBounds(WORLD_DEF.widthTiles, WORLD_DEF.heightTiles);
      const kept = clampCentreToDiamond(next, { width: cam.width, height: cam.height }, box);
      cam.setScroll(kept.x, kept.y);
    });
  }

  /** Render-side effects register in `worldEffects.ts`; they get one shared context, built once. */
  private startEffects(): void {
    const rect: TileRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this.effects = startEffects({
      scene: this,
      camera: this.cam,
      projection: isoProjection,
      motion: () => this.prefs.visuals.animations,
      terrainAt: (x, y) => WORLD_DEF.terrainAt(x, y),
      visibleTiles: () => tilesInView(isoProjection, this.cam.worldView, rect),
      tree: (id) => this.views.tree(id),
    });
    this.effects.chunksChanged(this.views.loaded());
  }

  private teardown(): void {
    this.nodes?.destroy();
    this.nodes = undefined;
    this.water?.destroy();
    this.water = undefined;
    this.fireViews?.destroy();
    this.fireViews = undefined;
    this.flicker = undefined;
    this.groundItems?.destroy();
    this.groundItems = undefined;
    this.effects?.destroy();
    this.effects = undefined;
    this.input$?.destroy();
    this.input$ = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.offEvents?.();
    this.offEvents = undefined;
    this.animator?.destroy();
    this.vfx?.destroy();
    this.views?.destroyAll();
    this.ground?.destroyAll();
    this.buildings?.destroyAll();
  }
}

const treeTitle = (t: TreeSpawn): string => (t.defId === 'oak_tree' ? 'Oak tree' : 'Tree');

const rockTitle = (r: RockSpawn): string =>
  r.defId.replace('_rock', '').replace(/^./, (c) => c.toUpperCase()) + ' rock';

const spotVerb = (s: FishingSpotSpawn): string =>
  s.defId === 'bait_spot' ? 'Bait Fishing spot' : 'Net Fishing spot';
