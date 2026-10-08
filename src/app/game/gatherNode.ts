/** A placed gatherable node (tree or rock) by id. Type-only registry import: no import cycle. */
import type { Content } from '@app/registry';

export interface GatherNodeSpawn {
  nodeId: string;
  defId: string;
  x: number;
  y: number;
}

export const gatherNode = (content: Content, nodeId: string): GatherNodeSpawn | undefined =>
  content.trees.get(nodeId) ?? content.rocks.get(nodeId);
