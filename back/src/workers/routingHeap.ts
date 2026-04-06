import type { QueueNode } from "./routingWorkerTypes.js";

const EPSILON = 1e-9;

export class MinHeap {
  private items: QueueNode[] = [];

  private compare(a: QueueNode, b: QueueNode): number {
    if (Math.abs(a.fScore - b.fScore) > EPSILON) {
      return a.fScore - b.fScore;
    }
    if (a.busTransferCount !== b.busTransferCount) {
      return a.busTransferCount - b.busTransferCount;
    }
    return a.cumulativeWalkM - b.cumulativeWalkM;
  }

  push(item: QueueNode): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): QueueNode | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.items[parent], this.items[current]) <= 0) {
        break;
      }
      [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    const length = this.items.length;
    while (true) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let smallest = current;

      if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }

      [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
      current = smallest;
    }
  }
}
