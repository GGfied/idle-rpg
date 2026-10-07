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
  createBuildingRenderer,
  createChunkRenderer,
  isInsideBuilding,
  isoProjection,
  setCameraZoom,
  setupCameraFor,
  createWaterOverlay,
  createGroundItemViews,
} from '@render/index';
import type {
  BuildingRenderer,
  GroundItemViews,
  WaterOverlay,
  Facing8,
  PlayerView,
} from '@render/index';
import {
  animateTreeFall,
  animateTreeRegrow,
  createPlayerAnimator,
  facingFromStep,
  nextAnimState,
} from '@render/animation';
import type { AnimState, PlayerAnimator } from '@render/animation';
import { startEffects, tilesInView } from '@render/effects';
import type { EffectRunner, TileRect } from '@render/effects';
import '@app/scenes/worldEffects';
import { LIMITS_DESKTOP, LIMITS_MOBILE, createVfx } from '@render/vfx';
import type { Vfx } from '@render/vfx';
import { CHUNK_SIZE, WORLD_DEF } from '@features/world';
import type { ObjectSpawn, TreeSpawn } from '@features/world';
import { WOODCUTTING_MESSAGES } from '@features/skills/woodcutting';
import { isBuildingShell } from '@app/scenes/buildingShell';
import { createChunkViews } from '@app/scenes/chunkViews';
import type { ChunkViews } from '@app/scenes/chunkViews';
import { minZoomForWindow } from '@app/scenes/zoomLimit';
import { clientToTile, clientToWorld } from '@app/scenes/clientToTile';
import { objectAtPoint } from '@app/scenes/objectAtPoint';
import type { HitTarget, IsOpaqueAt } from '@app/scenes/objectAtPoint';
import { advanceTrail, renderPosition, startTrail } from '@app/scenes/renderTrail';
import type { Trail } from '@app/scenes/renderTrail';
import { applyVisualPrefs } from '@app/scenes/applyPrefs';
import { clampCentreToDiamond, panScroll } from '@app/scenes/panCamera';
import { followOffset, hudInsets, withStackedAbove } from '@app/scenes/visibleArea';
import type { NpcInstance } from '@features/npc';
import { facilityMenu, npcMenu } from '@app/game/menus';
import { CONTENT } from '@app/registry';
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
  obj?: ObjectSpawn;
  npc?: NpcInstance;
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
  private effects?: EffectRunner;
  private water?: WaterOverlay;
  private ground!: ReturnType<typeof createChunkRenderer>;
  private buildings?: BuildingRenderer;
  private groundItems?: GroundItemViews;
  private lastGround: unknown = null;
  private targets: HitTarget<Hit>[] = [];
  private input$?: GestureInput;
  private unsubscribe?: () => void;
  private trail: Trail = startTrail({ x: 0, y: 0 }, 0);
  private cam!: Phaser.Cameras.Scene2D.Camera;
  private observer?: ResizeObserver;
  private animator?: PlayerAnimator;
  private vfx?: Vfx;
  private animState: AnimState = 'idle';
  private offEvents?: () => void;
  private lastRecentre = 0;
  private wasGathering = false;
  private facing: Facing8 = 's';
  private prefs!: Preferences;

  constructor(deps: SceneDeps) {
    super('world');
    this.deps = deps;
  }

  create(): void {
    const { store } = this.deps;
    const state = store.getState();
    this.prefs = state.prefs;
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
    this.ensureWindow(state.game.movement.position);

    this.player = createPlayerView(this, 'You');
    this.animator = createPlayerAnimator(this, this.player, {
      mode: state.prefs.visuals.animations,
    });
    // Every axe swing: one chat line + one sound, from the same impact moment.
    this.animator.onImpact = () => {
      this.deps.audio.handleEvent({ type: 'swingImpact' });
      this.deps.store.getState().say(WOODCUTTING_MESSAGES.started);
    };
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
    ground: { loaded: number; created: number };
  } {
    return {
      camera: this.cam,
      playerView: this.player,
      animator: this.animator,
      ground: { loaded: this.ground.loaded(), created: this.ground.created() },
    };
  }

  /** Per frame: only interpolates drawing between the previous and current tile. */
  override update(time: number): void {
    this.placePlayer(this.deps.alpha());
    this.ensureGround();
    this.animate(time);
    this.effects?.frame(time);
  }

  /** Per frame: pick the player's animation from plain state and advance it. */
  private animate(time: number): void {
    const g = this.deps.store.getState().game;
    const session = g.gathering.session;
    const moving = this.trail.from.x !== this.trail.to.x || this.trail.from.y !== this.trail.to.y;
    const toolKind = session ? CONTENT.gatherDefs.get(session.defId)?.toolKind : undefined;
    this.animState = nextAnimState(this.animState, {
      moving,
      gathering: session !== null,
      toolKind,
    });
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
    // Feet (diamond centre) of the player and of each node, in world px.
    const playerWorld = { x: this.player.container.x, y: this.player.container.y };
    const nodeWorld = (id: string): { x: number; y: number } | undefined => {
      const t = this.spawn(id);
      return t ? isoProjection.tileToWorld(t.x, t.y) : undefined;
    };
    for (const e of events) {
      this.vfx?.handleEvent({ ...e }, { playerWorld, nodeWorld });
      if (e.type === 'nodeDepleted') {
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
    const pos = game.movement.position;
    const before = this.trail;
    this.trail = advanceTrail(before, pos, this.deps.tick());
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
      const o = followOffset(insets, this.cam.zoom);
      this.cam.setFollowOffset(o.x, o.y);
    };
    this.applyInsets = apply;
    apply();
    this.scale.on(Phaser.Scale.Events.RESIZE, apply);
    window.addEventListener('resize', apply);
    this.observer = new ResizeObserver(apply);
    this.observer.observe(this.game.canvas);
    const hudEl = document.querySelector('#hud');
    if (hudEl) this.observer.observe(hudEl);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, apply);
      window.removeEventListener('resize', apply);
      this.observer?.disconnect();
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
      ...l.objects.map((o) => ({ tile: o, kind: o.kind, ref: { obj: o } })),
      ...l.npcs.map((n) => ({ tile: n, kind: 'npc' as const, ref: { npc: n } })),
    ];
  }

  /** Zoom, but never out past the point where the loaded chunks stop filling the view. */
  private zoomTo(zoom: number): void {
    const min = minZoomForWindow(this.cam, WINDOW_RADIUS, CHUNK_SIZE);
    setCameraZoom(this.cam, Math.max(zoom, min));
    this.applyInsets();
  }

  /** Alpha of a standing tree's art under a world point (follows sway); undefined = stump/other. */
  private readonly isOpaqueAt: IsOpaqueAt<Hit> = (target, wx, wy) => {
    const tree = target.ref.tree;
    const view = tree ? this.views.tree(tree.nodeId) : undefined;
    if (!view || !view.art.visible) return undefined;
    const art = view.art;
    const dx = wx - view.container.x - art.x;
    const dy = wy - view.container.y - art.y;
    const c = Math.cos(-art.rotation);
    const s = Math.sin(-art.rotation);
    const lx = (dx * c - dy * s) / art.scaleX + art.displayOriginX;
    const ly = (dx * s + dy * c) / art.scaleY + art.displayOriginY;
    if (lx < 0 || ly < 0 || lx >= art.width || ly >= art.height) return false;
    return (
      this.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), art.texture.key, art.frame.name) >
      20
    );
  };

  private applyInsets: () => void = () => undefined;

  /** Resume following the player (after a drag-pan), keeping the sheet-aware offset. */
  private followPlayer(): void {
    if (!this.cam) return;
    this.cam.startFollow(this.player.container, true, 0.15, 0.15);
    this.applyInsets();
  }

  private spawn(nodeId: string): TreeSpawn | undefined {
    return CONTENT.trees.get(nodeId);
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
      const { tree, obj, npc } = hit;
      const tile = tree ?? obj ?? npc ?? tileAt(x, y);
      if (!tile) return;
      const store = this.deps.store.getState();
      store.closeMenu();
      const at = isoProjection.tileToWorld(tile.x, tile.y);
      this.vfx?.clickMarker(at.x, at.y, tree || obj || npc ? 'interact' : 'walk');
      const using = store.useSelection !== null;
      if (using && (npc || obj || tree)) {
        if (npc) store.useItemOn({ kind: 'npc', id: npc.spawnId });
        else store.useItemOn({ kind: 'object', id: obj ? obj.objectId : tree!.nodeId });
      } else if (npc) store.interactNpc(npc.spawnId);
      else if (obj) store.interactFacility(obj.objectId);
      else if (tree) store.interactTree(tree.nodeId);
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
      const { tree, obj, npc } = hitAt(x, y);
      const tile = tree ?? obj ?? npc ?? tileAt(x, y);
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
        : obj
          ? facilityMenu(obj.kind).entries.map((e) => ({
              label: e.label,
              onSelect: () =>
                e.optionId
                  ? store.interactFacility(obj.objectId, e.optionId)
                  : store.examineFacility(obj.objectId),
            }))
          : tree
            ? [
                { label: 'Chop down Tree', onSelect: () => store.interactTree(tree.nodeId) },
                { label: 'Examine Tree', onSelect: () => store.examineTree(tree.nodeId) },
              ]
            : [{ label: 'Walk here', onSelect: () => store.walkTo(tile) }];
      options.push({ label: 'Cancel', onSelect: () => undefined });
      store.openMenu({
        x,
        y,
        title: npc
          ? npcMenu(npc.npcId).title
          : obj
            ? facilityMenu(obj.kind).title
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
    this.water?.destroy();
    this.water = undefined;
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
