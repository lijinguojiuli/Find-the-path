import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, MODES, applyEdit, cellFromPoint, createDemoGrid, validDimensions } from './model.mjs';
import { newLesson, advanceLesson } from './lesson.mjs';

test('示例地图与 Python 原型一致，包含九块障碍', () => {
  const grid = createDemoGrid();
  assert.deepEqual(grid.start, [0, 0]); assert.deepEqual(grid.goal, [29, 19]);
  assert.equal(grid.obstacleCount, 9); assert.equal(grid.isBlocked([15, 10]), false);
});
for (const [rows, cols] of [[0, 3], [-1, 3], [2.5, 3], [true, 3], [2, NaN]]) {
  test(`拒绝非法尺寸 ${rows}×${cols}`, () => assert.throws(() => new Grid(rows, cols)));
}
test('非正方形地图使用列作为 x、行作为 y', () => {
  const grid = new Grid(3, 5);
  assert.equal(grid.inBounds([4, 2]), true); assert.equal(grid.inBounds([5, 2]), false);
  assert.equal(grid.inBounds([4, 3]), false); assert.equal(grid.inBounds([true, 0]), false);
});
test('障碍可添加清除，且不能覆盖端点', () => {
  const grid = createDemoGrid(3, 5);
  assert.equal(applyEdit(grid, MODES.obstacle, [1, 1]).action, 'add');
  assert.equal(applyEdit(grid, MODES.obstacle, [1, 1]).action, 'remove');
  assert.equal(applyEdit(grid, MODES.obstacle, grid.start).changed, false);
  assert.equal(applyEdit(grid, MODES.obstacle, grid.goal).changed, false);
});
for (const mode of [MODES.start, MODES.goal]) {
  test(`${mode} 模式拒绝障碍，清除后可设置`, () => {
    const grid = new Grid(3, 5, { start: [0, 0], goal: [4, 2], obstacles: [[2, 1]] });
    const before = grid.snapshot();
    assert.equal(applyEdit(grid, mode, [2, 1]).changed, false);
    assert.deepEqual(grid.snapshot(), before);
    applyEdit(grid, MODES.obstacle, [2, 1]);
    assert.equal(applyEdit(grid, mode, [2, 1]).changed, true);
  });
}
test('起终点允许重合，重合格依然受到保护', () => {
  const grid = new Grid(1, 2, { start: [0, 0], goal: [1, 0] });
  assert.equal(applyEdit(grid, MODES.start, [1, 0]).changed, true);
  assert.deepEqual(grid.start, grid.goal);
  assert.equal(applyEdit(grid, MODES.obstacle, [1, 0]).changed, false);
});
for (const cell of [null, [-1, 0], [5, 0], [0, 3], [1.2, 0], [false, 0]]) {
  test(`非法位置 ${JSON.stringify(cell)} 不改变地图`, () => {
    const grid = createDemoGrid(3, 5), before = grid.snapshot();
    assert.equal(applyEdit(grid, MODES.obstacle, cell).changed, false);
    assert.deepEqual(grid.snapshot(), before);
  });
}
test('障碍集合和端点不泄漏可变状态', () => {
  const grid = new Grid(3, 5, { start: [0, 0], obstacles: [[1, 1]] });
  grid.obstacles.clear(); assert.equal(grid.obstacleCount, 1);
  assert.throws(() => { grid.start[0] = 2; });
});
test('快照可恢复地图，用于撤销', () => {
  const grid = createDemoGrid(3, 5), snapshot = grid.snapshot();
  applyEdit(grid, MODES.start, [1, 1]);
  const restored = new Grid(snapshot.rows, snapshot.cols, snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
});
for (const [x, y, expected] of [[10, 20, [0, 0]], [109.9, 79.9, [4, 2]], [110, 20, null], [10, 80, null], [9, 20, null], [10, 19, null], [30, 20, [1, 0]]]) {
  test(`像素边界 ${x},${y}`, () => assert.deepEqual(cellFromPoint(x, y, { left: 10, top: 20, size: 20 }, 3, 5), expected));
}
test('网页尺寸输入限制 1 到 80 的整数', () => {
  assert.equal(validDimensions(1, 80), true);
  for (const value of [0, 81, 1.5, NaN, Infinity]) assert.equal(validDimensions(value, 20), false);
});
test('教程只随实际完成的动作推进，并要求清除刚放下的格子', () => {
  let lesson = newLesson();
  lesson = advanceLesson(lesson, { changed: false, action: 'add', cell: [1, 1] });
  assert.equal(lesson.step, 0);
  lesson = advanceLesson(lesson, { changed: true, action: 'add', cell: [1, 1] });
  assert.equal(lesson.step, 1);
  lesson = advanceLesson(lesson, { changed: true, action: 'remove', cell: [2, 1] });
  assert.equal(lesson.step, 1);
  for (const [action, cell] of [['remove', [1, 1]], ['start', [2, 1]], ['goal', [3, 1]]]) lesson = advanceLesson(lesson, { changed: true, action, cell });
  assert.equal(lesson.step, 4); assert.equal(lesson.active, false);
  assert.equal(advanceLesson(lesson, { changed: true, action: 'add', cell: [1, 1] }), lesson);
});
