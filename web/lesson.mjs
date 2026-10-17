export const LESSON_STEPS = Object.freeze([
  { title: '放一块障碍', hint: '选择「障碍物」，在一块空白格上点一下。', mode: 'obstacle', action: 'add' },
  { title: '再点一下清除', hint: '再点一次刚刚添加的障碍。亮色边框会帮你找到它。', mode: 'obstacle', action: 'remove' },
  { title: '给机器人一个起点', hint: '选择「起点」，在另一块空地上点一下。', mode: 'start', action: 'start' },
  { title: '设置探索的终点', hint: '选择「终点」，在另一块空地上点一下。', mode: 'goal', action: 'goal' },
]);
export function newLesson() { return { active: true, step: 0, target: null }; }
export function advanceLesson(lesson, result) {
  if (!lesson.active || !result.changed || result.action !== LESSON_STEPS[lesson.step]?.action) return lesson;
  if (lesson.step === 1 && (!lesson.target || result.cell[0] !== lesson.target[0] || result.cell[1] !== lesson.target[1])) return lesson;
  const step = lesson.step + 1;
  return { active: step < LESSON_STEPS.length, step,
    target: lesson.step === 0 ? [...result.cell] : lesson.target };
}
