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
  TILE_SIZE,
  createPlayerView,
  createNpcView,
  createObjectView,
  createTreeView,
  drawTilemap,
  setCameraZoom,
  setupCamera,
} from '@render/index';
import type { PlayerView, TreeView } from '@render/index';
import {
  animateTreeFall,
  animateTreeRegrow,
  createPlayerAnimator,
  nextAnimState,
} from '@render/animation';
import type { AnimState, PlayerAnimator } from '@render/animation';
import { LIMITS_DESKTOP, LIMITS_MOBILE, createVfx } from '@render/vfx';
import type { Vfx } from '@render/vfx';
import { OBJECT_SPAWNS, TREE_SPAWNS, WORLD, terrainAt } from '@features/world';
import type { ObjectSpawn, TreeSpawn } from '@features/world';
import { clientToTile, clientToWorld } from '@app/scenes/clientToTile';
import { objectAtPoint } from '@app/scenes/objectAtPoint';
import type { HitTarget } from '@app/scenes/objectAtPoint';
import { advanceTrail, renderPosition, startTrail } from '@app/scenes/renderTrail';
import type { Trail } from '@app/scenes/renderTrail';
import { applyVisualPrefs } from '@app/scenes/applyPrefs';
import { panScroll } from '@app/scenes/panCamera';
import { followOffset, hudInsets, withStackedAbove } from '@app/scenes/visibleArea';
import { getNpcDef } from '@features/npc';
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

/** The world: draws what the store says, and turns pointer gestures into store intents. */
export class WorldScene extends Phaser.Scene {
  private readonly deps: SceneDeps;
  private player!: PlayerView;
  private trees = new Map<string, TreeView>();
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
  private faceLeft = false;
  private prefs!: Preferences;

  constructor(deps: SceneDeps) {
    super('world');
    this.deps = deps;
  }

  create(): void {
    const { store } = this.deps;
    const state = store.getState();
    this.prefs = state.prefs;
    drawTilemap(this, { width: WORLD.width, height: WORLD.height, kindAt: terrainAt });

    for (const t of TREE_SPAWNS) {
      const view = createTreeView(this, t.defId);
      view.setWorldPosition(t.x * TILE_SIZE + TILE_SIZE / 2, t.y * TILE_SIZE + TILE_SIZE / 2);
      this.trees.set(t.nodeId, view);
    }

    for (const o of OBJECT_SPAWNS) {
      const view = createObjectView(this, o.kind);
      view.setWorldPosition(o.x * TILE_SIZE + TILE_SIZE / 2, o.y * TILE_SIZE + TILE_SIZE / 2);
    }

    for (const n of CONTENT.npcs.values()) {
      const def = getNpcDef(n.npcId);
      if (!def) continue;
      const view = createNpcView(this, def.spriteKey, def.name);
      view.setWorldPosition(n.x * TILE_SIZE + TILE_SIZE / 2, n.y * TILE_SIZE + TILE_SIZE / 2);
    }

    this.player = createPlayerView(this, 'You');
    this.animator = createPlayerAnimator(this, this.player, {
      mode: state.prefs.visuals.animations,
    });
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
    const cam = setupCamera(
      this,
      this.player.container,
      WORLD.width * TILE_SIZE,
      WORLD.height * TILE_SIZE,
    );
    setCameraZoom(cam, START_ZOOM);
    this.cam = cam;
    this.watchVisibleArea();

    this.syncFromState(state);
    // Initial look only; after this stumps change through the fall/regrow animations.
    for (const [id, view] of this.trees) {
      const node = state.game.gathering.nodes[id];
      view.setDepleted(node !== undefined && isDepleted(node));
    }
    this.offEvents = this.deps.onEvents((events) => this.onTickEvents(events));
    this.unsubscribe = store.subscribe((s) => {
      if (s.prefs !== this.prefs) {
        this.prefs = s.prefs;
        applyVisualPrefs(s.prefs, { vfx: this.vfx, animator: this.animator });
      }
      this.syncFromState(s);
    });
    this.bindInput(cam);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
  }

  /** Read-only handles for the DEV QA hook (`window.__idleRpg`); nothing in the game calls this. */
  debugHandles(): {
    camera: Phaser.Cameras.Scene2D.Camera | undefined;
    playerView: PlayerView | undefined;
  } {
    return { camera: this.cam, playerView: this.player };
  }

  /** Per frame: only interpolates drawing between the previous and current tile. */
  override update(time: number): void {
    this.placePlayer(this.deps.alpha());
    this.animate(time);
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
      facingLeft: this.faceLeft,
      toolItemId: tool?.itemId,
    });
    this.animator?.update(time);
  }

  private onTickEvents(events: AppEvent[]): void {
    const playerWorld = { x: this.player.container.x, y: this.player.container.y - TILE_SIZE / 2 };
    const nodeWorld = (id: string): { x: number; y: number } | undefined => {
      const t = this.spawn(id);
      return t
        ? { x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 }
        : undefined;
    };
    for (const e of events) {
      this.vfx?.handleEvent({ ...e }, { playerWorld, nodeWorld });
      if (e.type === 'nodeDepleted') {
        const v = this.trees.get(e.nodeId);
        if (v) void animateTreeFall(this, v, {}, { mode: this.prefs.visuals.animations });
      } else if (e.type === 'nodeRespawned') {
        const v = this.trees.get(e.nodeId);
        if (v) void animateTreeRegrow(this, v, { mode: this.prefs.visuals.animations });
      }
    }
  }

  private placePlayer(alpha: number): void {
    const { x, y } = renderPosition(this.trail, alpha);
    this.player.setWorldPosition(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
  }

  /** Runs once per store change (every tick): moves tile targets, facing and stumps. */
  private syncFromState(s: AppState): void {
    const { game } = s;
    const pos = game.movement.position;
    const before = this.trail;
    this.trail = advanceTrail(before, pos, this.deps.tick());
    const dx = this.trail.to.x - this.trail.from.x;
    if (this.trail !== before && dx !== 0) this.faceLeft = dx < 0;
    const session = game.gathering.session;
    if (s.recentre !== this.lastRecentre || (session !== null && !this.wasGathering)) {
      this.lastRecentre = s.recentre;
      this.followPlayer();
    }
    this.wasGathering = session !== null;
    const tree = session ? this.trees.has(session.nodeId) && this.spawn(session.nodeId) : undefined;
    if (tree && tree.x !== pos.x) this.faceLeft = tree.x < pos.x;
    this.player.setFacing(this.faceLeft);
  }

  /**
   * The phone bottom sheet (or landscape side panel) overlays the canvas: keep the player centred in
   * the part that is still visible, and redo it on resize, sheet open/close and zoom.
   */
  private watchVisibleArea(): void {
    const apply = (): void => {
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

  private applyInsets: () => void = () => undefined;

  /** Resume following the player (after a drag-pan), keeping the sheet-aware offset. */
  private followPlayer(): void {
    if (!this.cam) return;
    this.cam.startFollow(this.player.container, true, 0.15, 0.15);
    this.applyInsets();
  }

  private spawn(nodeId: string): TreeSpawn | undefined {
    return TREE_SPAWNS.find((t) => t.nodeId === nodeId);
  }

  private bindInput(cam: Phaser.Cameras.Scene2D.Camera): void {
    const canvas = this.game.canvas;
    const input = createGestureInput(canvas);
    this.input$ = input;

    const tileAt = (clientX: number, clientY: number): Tile | null =>
      clientToTile(clientX, clientY, canvas.getBoundingClientRect(), canvas, cam, WORLD);

    // Prefer an object whose drawn bounds (render hit bounds) hold the pointer over the ground tile.
    const targets: HitTarget<Hit>[] = [
      ...TREE_SPAWNS.map((t) => ({ tile: t, kind: t.defId, ref: { tree: t } })),
      ...OBJECT_SPAWNS.map((o) => ({ tile: o, kind: o.kind, ref: { obj: o } })),
      ...[...CONTENT.npcs.values()].map((n) => ({
        tile: n,
        kind: 'npc' as const,
        ref: { npc: n },
      })),
    ];
    const hitAt = (clientX: number, clientY: number): Hit => {
      const w = clientToWorld(clientX, clientY, canvas.getBoundingClientRect(), canvas, cam);
      return (w && objectAtPoint(w.x, w.y, targets)) || {};
    };

    input.on('tap', ({ x, y }) => {
      const hit = hitAt(x, y);
      const { tree, obj, npc } = hit;
      const tile = tree ?? obj ?? npc ?? tileAt(x, y);
      if (!tile) return;
      const store = this.deps.store.getState();
      store.closeMenu();
      this.vfx?.clickMarker(
        tile.x * TILE_SIZE + TILE_SIZE / 2,
        tile.y * TILE_SIZE + TILE_SIZE / 2,
        tree || obj || npc ? 'interact' : 'walk',
      );
      if (npc) store.interactNpc(npc.spawnId);
      else if (obj) store.interactFacility(obj.objectId);
      else if (tree) store.interactTree(tree.nodeId);
      else {
        store.walkTo(tile);
        this.deps.audio.play('walkClick');
      }
    });

    input.on('longPress', ({ x, y }) => {
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
      setCameraZoom(cam, cam.zoom * scale);
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
        { width: WORLD.width * TILE_SIZE, height: WORLD.height * TILE_SIZE },
      );
      cam.setScroll(next.x, next.y);
    });
  }

  private teardown(): void {
    this.input$?.destroy();
    this.input$ = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.offEvents?.();
    this.offEvents = undefined;
    this.animator?.destroy();
    this.vfx?.destroy();
  }
}

const treeTitle = (t: TreeSpawn): string => (t.defId === 'oak_tree' ? 'Oak tree' : 'Tree');
