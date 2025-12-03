"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservoirSampler = void 0;
class ReservoirSampler {
    constructor(k = 1) {
        this.k = k;
        this.reservoir = [];
        this.count = 0;
    }
    add(item) {
        this.count++;
        if (this.count <= this.k) {
            // Fill reservoir until it has k items
            this.reservoir.push(item);
        }
        else {
            // Randomly replace an existing item
            const j = Math.floor(Math.random() * this.count);
            if (j < this.k) {
                this.reservoir[j] = item;
            }
        }
    }
    getSample() {
        return [...this.reservoir];
    }
}
exports.ReservoirSampler = ReservoirSampler;
