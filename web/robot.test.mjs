import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from './model.mjs';
import { searchGrid } from './search.mjs';
import { Robot } from './robot.mjs';
function setup() {
  const grid = new Grid(1, 5, { start: [0, 0], goal: [4, 0] });
  return { grid, robot: new Robot(grid, searchGrid(grid).path, 2) };
}
test('时间推进、暂停、继续、到达停止、重置后重新出发', () => {
  const { robot } = setup();
  robot.update(100); assert.deepEqual(robot.position, [0, 0]);
  robot.start(); robot.update(.25); robot.pause(); robot.update(100);
  assert.deepEqual(robot.position, [0, 0]);
  robot.start(); robot.update(.25); assert.deepEqual(robot.position, [1, 0]);
  robot.update(100); assert.equal(robot.state, 'arrived'); assert.deepEqual(robot.position, [4, 0]);
  robot.start(); robot.update(100); assert.deepEqual(robot.position, [4, 0]);
  robot.reset(); assert.equal(robot.index, 0); robot.start(); robot.update(.5); assert.equal(robot.index, 1);
});
test('帧率不影响相同累计时间的位置', () => {
  const first = setup().robot, second = setup().robot;
  first.start(); second.start(); first.update(1.5);
  for (let i = 0; i < 15; i++) second.update(.1);
  assert.deepEqual(first.position, second.position);
});
test('低帧率跨多格时逐格校验障碍，不跳过墙', () => {
  const { grid, robot } = setup();
  grid.addObstacle([2, 0]); robot.start(); robot.update(100);
  assert.deepEqual(robot.position, [1, 0]); assert.equal(robot.state, 'blocked');
});
test('拒绝空路径、穿墙、非四邻接和错误端点', () => {
  const { grid } = setup();
  for (const path of [[], [[0, 0]], [[0, 0], [4, 0]], [[1, 0], [4, 0]]]) assert.throws(() => new Robot(grid, path));
  grid.addObstacle([2, 0]); assert.throws(() => new Robot(grid, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]));
});
test('同起终点立即到达，路径数据不可被外部篡改', () => {
  const grid = new Grid(1, 1, { start: [0, 0], goal: [0, 0] }), path = [[0, 0]];
  const robot = new Robot(grid, path); path[0][0] = 9;
  robot.start(); robot.update(100); assert.equal(robot.state, 'arrived'); assert.deepEqual(robot.position, [0, 0]);
  assert.throws(() => { robot.position[0] = 2; });
});
test('拒绝非法时间和速度，调速后仍按时间前进', () => {
  const { robot } = setup();
  for (const value of [0, -1, NaN, Infinity, true, '2']) assert.throws(() => robot.setSpeed(value));
  for (const value of [-1, NaN, Infinity, true, '2']) assert.throws(() => robot.update(value));
  robot.setSpeed(1); robot.start(); robot.update(1); assert.equal(robot.index, 1);
});
