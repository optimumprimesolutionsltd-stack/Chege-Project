import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "It should be able to be used by a 12 year old. Simple to understand, use and
// navigate." Simple view keeps four tabs and moves the rest under More.
describe('Simple view is wired into the tab bar', () => {
  const layout = read('app/(tabs)/_layout.tsx');

  it('builds the bar from the tab plan, in both layouts', () => {
    expect(layout).toContain('visibleTabs({ simple, isShared, showBudget, showDebt, showReports })');
    expect(layout).toContain('<NativeTabLayout key={layoutKey} visible={visible} />');
    expect(layout).toContain('<ClassicTabLayout key={layoutKey} visible={visible} />');
  });

  it('remounts the navigator when the view is switched, as it does for any other change of tabs', () => {
    expect(layout).toContain("${simple ? 'simple' : 'full'}");
  });

  it('has a More tab in both layouts, only when the plan includes it', () => {
    expect(layout).toContain('<NativeTabs.Trigger name="more">');
    expect(layout).toContain("name=\"more\"");
    expect(layout).toContain("has('more')");
  });
});

describe('the More screen', () => {
  const more = read('app/(tabs)/more.tsx');

  it('reaches everything the small bar leaves out, each with a one-line reason', () => {
    for (const route of ['/(tabs)/bank', '/(tabs)/reports', '/(tabs)/contributions', '/(tabs)/search', '/parties', '/(tabs)/debt', '/help', '/(tabs)/settings']) {
      expect(more).toContain(`'${route}'`);
    }
    expect(more).toContain('hint:');
  });

  it('only lists what this budget has', () => {
    expect(more).toContain('show: showReports');
    expect(more).toContain('show: isShared');
    expect(more).toContain('show: !isShared');
    expect(more).toContain('show: showDebt');
  });

  it('lets the full bar be brought back', () => {
    expect(more).toContain('testID="more-simple-view-switch"');
    expect(more).toContain('onValueChange={setSimple}');
  });

  it('uses plain words', () => {
    expect(more).toContain("title: 'Who owes who'");
    expect(more).toContain("title: 'Who put in money'");
  });
});

describe('the choice is remembered on the device, and defaults to simple', () => {
  const hook = read('hooks/useSimpleView.ts');
  it('starts on and only turns off when the stored value says so', () => {
    expect(hook).toContain('let simple = true;');
    expect(hook).toContain("if (stored === 'off' && simple)");
    expect(hook).toContain("AsyncStorage.setItem(SIMPLE_VIEW_KEY, next ? 'on' : 'off')");
  });
});
