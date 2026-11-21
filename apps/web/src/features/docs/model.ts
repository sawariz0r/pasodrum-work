import { fallbackSpace } from '../../app/places';
import { scopeOf, useDocsBoards, useWorkspace, type PageNode, type Space, type SpacePages } from '../../matrix';

export interface Located {
  node: PageNode;
  /** Ancestors, outermost first. */
  path: PageNode[];
}

export function locate(pages: Record<string, SpacePages>, pageId: string): Located | undefined {
  const walk = (list: PageNode[], path: PageNode[]): Located | undefined => {
    for (const node of list) {
      if (node.id === pageId) return { node, path };
      const hit = walk(node.children, [...path, node]);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const space of Object.values(pages)) {
    const hit = walk(space.roots, []);
    if (hit) return hit;
  }
  return undefined;
}

export function flatten(list: PageNode[], depth = 0, out: { node: PageNode; depth: number }[] = []) {
  for (const node of list) {
    out.push({ node, depth });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

export function contains(node: PageNode, id: string): boolean {
  return node.id === id || node.children.some((c) => contains(c, id));
}

/** The selected space (its rail tile is lit) and what the tree lists for it. */
export function useScope(): { selected?: Space; scope: Space[] } {
  const spaces = useWorkspace((x) => x.spaces);
  const selected = fallbackSpace(spaces);
  return { selected, scope: selected ? scopeOf(spaces, selected) : [] };
}

/** The page tree is in the snapshot once the first sync has been read. */
export function usePagesLoaded(spaceIds: string[]): boolean {
  return useDocsBoards((s) => spaceIds.every((id) => s.pages[id] !== undefined));
}
