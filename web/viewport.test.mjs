import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateViewport } from './viewport.mjs';
import { cellFromPoint, createDemoGrid } from './model.mjs';
import { searchGrid } from './search.mjs';

test('回归：20×30 地图在仅剩 110 像素高度时也保持 28 像素格子', () => {
  const view = calculateViewport({ rows: 20, cols: 30, width: 875, height: 110 });
  assert.equal(view.size, 28);
  assert.equal(view.contentWidth, 888);
  assert.equal(view.contentHeight, 608);
  assert.equal(view.lastRow, 4);
});
test('窄窗口和大地图通过滚动扩展，不缩小格子', () => {
  const view = calculateViewport({ rows: 80, cols: 80, width: 320, height: 400, cellSize: 48 });
  assert.equal(view.size, 48);
  assert.equal(view.contentWidth, 3888);
  assert.equal(view.contentHeight, 3888);
  assert(view.lastCol < 80 && view.lastRow < 80);
});
test('小地图居中，内容无须产生多余滚动', () => {
  const view = calculateViewport({ rows: 3, cols: 5, width: 900, height: 600 });
  assert.equal(view.left, 380);
  assert.equal(view.top, 258);
  assert.equal(view.contentWidth, 900);
  assert.equal(view.contentHeight, 600);
});
test('缩放与滚动后，所有可见格中心映射回同一个地图坐标', () => {
  for (const size of [16, 24, 28, 36, 48]) {
    for (const scroll of [0, 31, 150, 10000]) {
      const view = calculateViewport({ rows: 20, cols: 30, width: 400, height: 300, cellSize: size, scrollLeft: scroll, scrollTop: scroll });
      for (let y = view.firstRow; y < view.lastRow; y++) {
        for (let x = view.firstCol; x < view.lastCol; x++) {
          const px = view.left + (x + .5) * size, py = view.top + (y + .5) * size;
          if (px >= 0 && px < 400 && py >= 0 && py < 300) assert.deepEqual(cellFromPoint(px, py, view, 20, 30), [x, y]);
        }
      }
    }
  }
});
test('滚动到底仍可点击最后一格，右下外边界安全忽略', () => {
  const view = calculateViewport({ rows: 20, cols: 30, width: 400, height: 300, scrollLeft: 10000, scrollTop: 10000 });
  assert.deepEqual(cellFromPoint(view.left + 29.5 * 28, view.top + 19.5 * 28, view, 20, 30), [29, 19]);
  assert.equal(cellFromPoint(view.left + 30 * 28, view.top + 20 * 28, view, 20, 30), null);
});
test('调整视图不修改地图、路径或访问顺序', () => {
  const grid = createDemoGrid(), before = grid.snapshot(), result = searchGrid(grid);
  for (const size of [16, 28, 48]) calculateViewport({ rows: grid.rows, cols: grid.cols, width: 320, height: 200, cellSize: size, scrollTop: 200 });
  assert.deepEqual(grid.snapshot(), before);
  assert.deepEqual(searchGrid(grid), result);
});
test('视图尺寸和缩放的非法输入被拒绝', () => {
  const valid = { rows: 20, cols: 30, width: 900, height: 600 };
  for (const invalid of [{ rows: 0 }, { cols: -1 }, { width: 0 }, { height: NaN }, { cellSize: 15 }, { cellSize: 49 }, { scrollTop: Infinity }]) {
    assert.throws(() => calculateViewport({ ...valid, ...invalid }));
  }
});
