/**
 * Ultra-simple FIFO queue for GitHub tasks.
 */
export default class TaskQueue {
  constructor() {
    this.tasks = [];
  }

  enqueue(task) {
    this.tasks.push(task);
  }

  dequeue() {
    return this.tasks.shift();
  }

  size() {
    return this.tasks.length;
  }

  isEmpty() {
    return this.size() === 0;
  }

  /**
   * Pretty-prints current queue contents.
   */
  print() {
    this.tasks.forEach((t, i) => {
      console.log(`#${i + 1} [${t.title}] -> ${t.html_url}`);
    });
  }
}
