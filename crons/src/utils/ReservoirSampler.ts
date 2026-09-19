export class ReservoirSampler<T> {
  private reservoir: T[] = [];
  private count = 0;

  constructor(private k: number = 1) {}

  add(item: T): void {
    this.count++;

    if (this.count <= this.k) {
      // Fill reservoir until it has k items
      this.reservoir.push(item);
    } else {
      // Randomly replace an existing item
      const j = Math.floor(Math.random() * this.count);
      if (j < this.k) {
        this.reservoir[j] = item;
      }
    }
  }

  getSample(): T[] {
    return [...this.reservoir];
  }
}
