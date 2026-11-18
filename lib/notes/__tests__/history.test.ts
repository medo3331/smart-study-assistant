import { describe, it, expect } from "vitest";
import { UndoStack } from "../history";

describe("UndoStack", () => {
  it("starts with the initial state and no history", () => {
    const stack = new UndoStack<string>("a");
    expect(stack.current).toBe("a");
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.depth).toBe(0);
  });

  it("undoes and redoes a committed state", () => {
    const stack = new UndoStack<string>("a");
    stack.push("b");
    expect(stack.current).toBe("b");
    expect(stack.canUndo).toBe(true);

    expect(stack.undo()).toBe("a");
    expect(stack.current).toBe("a");
    expect(stack.canRedo).toBe(true);

    expect(stack.redo()).toBe("b");
    expect(stack.current).toBe("b");
    expect(stack.canRedo).toBe(false);
  });

  it("returns null when there is nothing to undo or redo", () => {
    const stack = new UndoStack<number>(0);
    expect(stack.undo()).toBeNull();
    expect(stack.redo()).toBeNull();
  });

  it("drops the redo branch after a new edit", () => {
    const stack = new UndoStack<string>("a");
    stack.push("b");
    stack.undo();
    expect(stack.canRedo).toBe(true);

    stack.push("c");
    expect(stack.current).toBe("c");
    expect(stack.canRedo).toBe(false);
    expect(stack.undo()).toBe("a");
  });

  it("bounds the history at the configured limit", () => {
    const stack = new UndoStack<number>(0, 3);
    for (let i = 1; i <= 10; i += 1) stack.push(i);

    expect(stack.depth).toBe(3);
    expect(stack.current).toBe(10);

    // Only the last three steps survive.
    expect(stack.undo()).toBe(9);
    expect(stack.undo()).toBe(8);
    expect(stack.undo()).toBe(7);
    expect(stack.undo()).toBeNull();
  });

  it("rejects a non-positive limit", () => {
    expect(() => new UndoStack<string>("a", 0)).toThrow();
    expect(() => new UndoStack<string>("a", 1.5)).toThrow();
  });

  it("resets the state and clears both branches", () => {
    const stack = new UndoStack<string>("a");
    stack.push("b");
    stack.undo();

    stack.reset("fresh");
    expect(stack.current).toBe("fresh");
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });

  it("keeps snapshots by reference so a page's array is not copied", () => {
    const first = [{ id: "s1" }];
    const second = [{ id: "s1" }, { id: "s2" }];
    const stack = new UndoStack(first);
    stack.push(second);

    expect(stack.current).toBe(second);
    expect(stack.undo()).toBe(first);
  });
});
